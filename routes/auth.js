const express = require('express');
const router = express.Router();
const pool = require('../db');

router.post('/auth/register', async (req, res) => {
  try {
    const { nom, prenom, email, telephone, motDePasseHash } = req.body;

    const result = await pool.query(`
      INSERT INTO users (
        nom, prenom, email, telephone, mot_de_passe_hash, role, statut
      )
      VALUES ($1, $2, $3, $4, $5, 'client', 'actif')
      RETURNING id, nom, prenom, email, role, statut, created_at
    `, [nom, prenom, email, telephone, motDePasseHash]);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur POST /auth/register :', error);
    res.status(400).json({ error: error.message });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email } = req.body;

    const result = await pool.query(`
      SELECT id, nom, prenom, email, telephone, mot_de_passe_hash, role, statut
      FROM users
      WHERE email = $1
    `, [email]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur POST /auth/login :', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;