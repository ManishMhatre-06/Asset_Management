const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL Connection Pool (using config from docker-compose.yaml)[cite: 2]
const pool = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'Asset_Management'
});

// Middleware to serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Add this endpoint to your existing server.js
app.get('/api/categories-summary', async (req, res) => {
    try {
        const query = `
            SELECT 
                c.CategoryID AS "CategoryID", 
                c.CategoryName AS "CategoryName", 
                COUNT(a.AssetID) AS "TotalAssets"
            FROM Category c
            LEFT JOIN Asset a ON c.CategoryID = a.CategoryID
            GROUP BY c.CategoryID, c.CategoryName
            ORDER BY c.CategoryID;
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching categories summary:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API Endpoint to fetch all assets with employee and category details
app.get('/api/assets', async (req, res) => {
    try {
        const query = `
            SELECT 
                a.AssetID AS "AssetID", 
                a.PurchaseDate AS "PurchaseDate", 
                a.Manufacturer AS "Manufacturer", 
                a.SrNumber AS "SrNumber", 
                TRIM(CONCAT(COALESCE(e.EmpfirstName, ''), ' ', COALESCE(e.Emplastname, ''))) AS "EmployeeName",
                c.CategoryName AS "CategoryName"
            FROM Asset a
            LEFT JOIN Employee e ON a.EmpID = e.EmpID
            LEFT JOIN Category c ON a.CategoryID = c.CategoryID
            ORDER BY a.AssetID;
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching asset data:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server & Test Database Connection
app.listen(PORT, async () => {
    try {
        const client = await pool.connect();
        console.log('\n✅ SUCCESS: Connected to PostgreSQL database successfully!');
        client.release();
    } catch (err) {
        console.error('\n❌ ERROR: Failed to connect to PostgreSQL database:', err.message);
    }
    console.log(`🚀 Server is running at http://localhost:${PORT}`);
});