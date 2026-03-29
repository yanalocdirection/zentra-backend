const express = require('express');
const router = express.Router();
const pool = require('../db');
const stripe = require('../stripe');

// Convertit EUR en centimes
function toStripeAmount(amount) {
  return Math.round(Number(amount) * 100);
}

// 1) Créer un PaymentIntent pour le paiement de réservation
router.post('/payments/create-payment-intent', async (req, res) => {
  try {
    const { reservation_id } = req.body;

    const reservationResult = await pool.query(
      `
      SELECT id, user_id, montant_estime
      FROM reservations
      WHERE id = $1
      `,
      [reservation_id]
    );

    if (reservationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Réservation introuvable' });
    }

    const reservation = reservationResult.rows[0];

    const paymentIntent = await stripe.paymentIntents.create({
      amount: toStripeAmount(reservation.montant_estime),
      currency: 'eur',
      automatic_payment_methods: {
        enabled: true
      },
      metadata: {
        reservation_id: String(reservation.id),
        user_id: String(reservation.user_id),
        type: 'reservation_payment'
      }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
    });
  } catch (error) {
    console.error('Erreur create-payment-intent:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2) Enregistrer le paiement après confirmation Stripe
router.post('/payments/confirm-payment', async (req, res) => {
  try {
    const { reservation_id, payment_intent_id, methode = 'carte', fournisseur_paiement = 'stripe' } = req.body;

    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        error: `Paiement non confirmé. Statut Stripe actuel : ${paymentIntent.status}`
      });
    }

    const reservationResult = await pool.query(
      `
      SELECT id, user_id, montant_estime
      FROM reservations
      WHERE id = $1
      `,
      [reservation_id]
    );

    if (reservationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Réservation introuvable' });
    }

    const reservation = reservationResult.rows[0];

    const insertResult = await pool.query(
      `
      INSERT INTO payments (
        reservation_id,
        user_id,
        montant,
        devise,
        methode,
        statut,
        transaction_reference,
        fournisseur_paiement,
        date_paiement,
        details
      )
      VALUES ($1, $2, $3, 'EUR', $4, 'paye', $5, $6, CURRENT_TIMESTAMP, $7)
      RETURNING *
      `,
      [
        reservation.id,
        reservation.user_id,
        reservation.montant_estime,
        methode,
        paymentIntent.id,
        fournisseur_paiement,
        JSON.stringify({
          stripe_payment_intent_id: paymentIntent.id,
          stripe_status: paymentIntent.status
        })
      ]
    );

    res.json(insertResult.rows[0]);
  } catch (error) {
    console.error('Erreur confirm-payment:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3) Créer un PaymentIntent pour la caution en capture manuelle
router.post('/deposits/create-deposit-intent', async (req, res) => {
  try {
    const { reservation_id } = req.body;

    const reservationResult = await pool.query(
      `
      SELECT id, user_id, caution_montant
      FROM reservations
      WHERE id = $1
      `,
      [reservation_id]
    );

    if (reservationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Réservation introuvable' });
    }

    const reservation = reservationResult.rows[0];

    const paymentIntent = await stripe.paymentIntents.create({
      amount: toStripeAmount(reservation.caution_montant),
      currency: 'eur',
      capture_method: 'manual',
      automatic_payment_methods: {
        enabled: true
      },
      metadata: {
        reservation_id: String(reservation.id),
        user_id: String(reservation.user_id),
        type: 'deposit_authorization'
      }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
    });
  } catch (error) {
    console.error('Erreur create-deposit-intent:', error);
    res.status(500).json({ error: error.message });
  }
});

// 4) Enregistrer la caution autorisée
router.post('/deposits/confirm-deposit', async (req, res) => {
  try {
    const { reservation_id, payment_intent_id, fournisseur_paiement = 'stripe' } = req.body;

    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);

    if (paymentIntent.status !== 'requires_capture') {
      return res.status(400).json({
        error: `Caution non autorisée. Statut Stripe actuel : ${paymentIntent.status}`
      });
    }

    const reservationResult = await pool.query(
      `
      SELECT id, user_id, caution_montant
      FROM reservations
      WHERE id = $1
      `,
      [reservation_id]
    );

    if (reservationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Réservation introuvable' });
    }

    const reservation = reservationResult.rows[0];

    const insertResult = await pool.query(
      `
      INSERT INTO deposits (
        reservation_id,
        user_id,
        montant,
        statut,
        transaction_reference,
        fournisseur_paiement,
        date_autorisation
      )
      VALUES ($1, $2, $3, 'autorisee', $4, $5, CURRENT_TIMESTAMP)
      ON CONFLICT (reservation_id)
      DO UPDATE SET
        montant = EXCLUDED.montant,
        statut = 'autorisee',
        transaction_reference = EXCLUDED.transaction_reference,
        fournisseur_paiement = EXCLUDED.fournisseur_paiement,
        date_autorisation = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
      `,
      [
        reservation.id,
        reservation.user_id,
        reservation.caution_montant,
        paymentIntent.id,
        fournisseur_paiement
      ]
    );

    res.json(insertResult.rows[0]);
  } catch (error) {
    console.error('Erreur confirm-deposit:', error);
    res.status(500).json({ error: error.message });
  }
});

// 5) Capturer la caution si nécessaire
router.post('/deposits/capture', async (req, res) => {
  try {
    const { reservation_id, motif_capture = 'Dommages ou frais complémentaires' } = req.body;

    const depositResult = await pool.query(
      `
      SELECT *
      FROM deposits
      WHERE reservation_id = $1
      `,
      [reservation_id]
    );

    if (depositResult.rows.length === 0) {
      return res.status(404).json({ error: 'Caution introuvable' });
    }

    const deposit = depositResult.rows[0];

    const captured = await stripe.paymentIntents.capture(deposit.transaction_reference);

    await pool.query(
      `
      UPDATE deposits
      SET statut = 'capturee',
          date_capture = CURRENT_TIMESTAMP,
          motif_capture = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE reservation_id = $1
      `,
      [reservation_id, motif_capture]
    );

    res.json({
      success: true,
      stripeStatus: captured.status
    });
  } catch (error) {
    console.error('Erreur capture deposit:', error);
    res.status(500).json({ error: error.message });
  }
});

// 6) Libérer / annuler la caution non capturée
router.post('/deposits/release', async (req, res) => {
  try {
    const { reservation_id } = req.body;

    const depositResult = await pool.query(
      `
      SELECT *
      FROM deposits
      WHERE reservation_id = $1
      `,
      [reservation_id]
    );

    if (depositResult.rows.length === 0) {
      return res.status(404).json({ error: 'Caution introuvable' });
    }

    const deposit = depositResult.rows[0];

    const canceled = await stripe.paymentIntents.cancel(deposit.transaction_reference);

    await pool.query(
      `
      UPDATE deposits
      SET statut = 'liberee',
          date_liberation = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE reservation_id = $1
      `,
      [reservation_id]
    );

    res.json({
      success: true,
      stripeStatus: canceled.status
    });
  } catch (error) {
    console.error('Erreur release deposit:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;