const express = require('express');
const router = express.Router();
const pool = require('../db');

router.post('/reservations', async (req, res) => {
  try {
    const {
      user_id,
      scooter_id,
      station_depart_id,
      pricing_plan_id,
      montant_estime,
      caution
    } = req.body;

    const result = await pool.query(
      `SELECT reserver_scooter($1, $2, $3, $4, $5, $6) AS reservation_id`,
      [user_id, scooter_id, station_depart_id, pricing_plan_id, montant_estime, caution]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur POST /reservations :', error);
    res.status(400).json({ error: error.message });
  }
});

router.get('/reservations/:id', async (req, res) => {
  try {
    const reservationId = req.params.id;

    const result = await pool.query(`
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
    `, [reservationId]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur GET /reservations/:id :', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;