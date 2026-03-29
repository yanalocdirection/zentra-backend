import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";
import pkg from "pg";

dotenv.config();

const { Pool } = pkg;

const app = express();
const port = process.env.PORT || 4242;

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY manquante dans les variables d'environnement");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
    })
  : new Pool({
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || "zentra_v2",
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "",
    });

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());

app.get("/", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      name: "ZENTRA backend",
      status: "ok",
      port,
      server_url: "https://zentra-backend-hy00.onrender.com",
      database: "connected",
    });
  } catch (error) {
    res.status(500).json({
      name: "ZENTRA backend",
      status: "error",
      port,
      server_url: "https://zentra-backend-hy00.onrender.com",
      database: "disconnected",
      details: error.message,
    });
  }
});

app.get("/api/stations", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        code,
        nom,
        adresse,
        ville,
        capacite_totale,
        statut,
        ST_Y(position::geometry) AS latitude,
        ST_X(position::geometry) AS longitude
      FROM stations
      WHERE statut = 'active'
      ORDER BY nom ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Erreur /api/stations :", error);
    res.status(500).json({
      error: "Impossible de récupérer les stations",
      details: error.message,
    });
  }
});

app.get("/api/stations/nearby", async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        error: "lat et lng sont requis",
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        code,
        nom,
        adresse,
        ville,
        capacite_totale,
        statut,
        ST_Y(position::geometry) AS latitude,
        ST_X(position::geometry) AS longitude,
        ROUND((
          ST_Distance(
            position,
            ST_GeogFromText('SRID=4326;POINT(' || $1 || ' ' || $2 || ')')
          ) / 1000
        )::numeric, 2) AS distance_km
      FROM stations
      WHERE statut = 'active'
      ORDER BY distance_km ASC
      `,
      [lng, lat]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Erreur /api/stations/nearby :", error);
    res.status(500).json({
      error: "Impossible de récupérer les stations proches",
      details: error.message,
    });
  }
});

app.get("/api/stations/:id/scooters", async (req, res) => {
  try {
    const stationId = req.params.id;

    const result = await pool.query(
      `
      SELECT
        id,
        code,
        modele,
        marque,
        categorie,
        batterie_pourcentage,
        autonomie_km,
        statut,
        qr_code
      FROM scooters
      WHERE station_id = $1
        AND statut = 'disponible'
        AND actif = TRUE
      ORDER BY batterie_pourcentage DESC, code ASC
      `,
      [stationId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Erreur /api/stations/:id/scooters :", error);
    res.status(500).json({
      error: "Impossible de récupérer les scooters",
      details: error.message,
    });
  }
});

app.post("/api/reservations", async (req, res) => {
  try {
    const {
      user_id,
      scooter_id,
      station_depart_id,
      pricing_plan_id,
      montant_estime,
      caution,
    } = req.body;

    const result = await pool.query(
      `SELECT reserver_scooter($1, $2, $3, $4, $5, $6) AS reservation_id`,
      [
        user_id,
        scooter_id,
        station_depart_id,
        pricing_plan_id,
        montant_estime,
        caution,
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Erreur /api/reservations :", error);
    res.status(400).json({
      error: "Impossible de créer la réservation",
      details: error.message,
    });
  }
});

app.get("/api/reservations/:id", async (req, res) => {
  try {
    const reservationId = req.params.id;

    const result = await pool.query(
      `
      SELECT
        r.id,
        r.reference,
        r.user_id,
        r.scooter_id,
        r.station_depart_id,
        r.station_arrivee_id,
        r.pricing_plan_id,
        r.statut,
        r.date_reservation,
        r.date_expiration,
        r.date_debut_reelle,
        r.date_fin_reelle,
        r.montant_estime,
        r.montant_final,
        r.caution_montant,
        r.code_acces
      FROM reservations r
      WHERE r.id = $1
      `,
      [reservationId]
    );

    res.json(result.rows[0] || null);
  } catch (error) {
    console.error("Erreur /api/reservations/:id :", error);
    res.status(500).json({
      error: "Impossible de récupérer la réservation",
      details: error.message,
    });
  }
});

app.post("/create-payment-intent", async (req, res) => {
  try {
    const { amount, currency = "eur", metadata = {} } = req.body;

    if (!Number.isInteger(amount) || amount <= 0) {
      return res.status(400).json({
        error: "Le montant doit être un entier positif en centimes.",
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata,
    });

    return res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error("Erreur create-payment-intent:", error);
    return res.status(500).json({
      error: "Impossible de créer le paiement.",
      details: error instanceof Error ? error.message : "Erreur inconnue",
    });
  }
});

app.post("/create-deposit-intent", async (req, res) => {
  try {
    const { amount = 30000, currency = "eur", metadata = {} } = req.body;

    if (!Number.isInteger(amount) || amount <= 0) {
      return res.status(400).json({
        error: "Le montant de caution doit être un entier positif en centimes.",
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: {
        enabled: true,
      },
      capture_method: "manual",
      metadata: {
        ...metadata,
        type: "deposit",
      },
    });

    return res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error("Erreur create-deposit-intent:", error);
    return res.status(500).json({
      error: "Impossible de créer la caution.",
      details: error instanceof Error ? error.message : "Erreur inconnue",
    });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`ZENTRA backend lancé sur le port ${port}`);
});
