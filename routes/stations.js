const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/stations', async (req, res) => {
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
    console.error('Erreur /stations :', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/stations/nearby', async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'lat et lng sont requis' });
    }

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
    `, [lng, lat]);

    res.json(result.rows);
  } catch (error) {
    console.error('Erreur /stations/nearby :', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/stations/:id/scooters', async (req, res) => {
  try {
    const stationId = req.params.id;

    const result = await pool.query(`
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
    `, [stationId]);

    res.json(result.rows);
  } catch (error) {
    console.error('Erreur /stations/:id/scooters :', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;