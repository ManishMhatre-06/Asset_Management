const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL Connection Pool (using config from docker-compose.yaml)
const pool = new Pool({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'Asset_Management'
});

// Middleware for parsing form data and JSON
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session configuration
app.use(session({
    secret: 'asset_management_secure_secret_key',
    resave: false,
    saveUninitialized: false
}));

// Serve public static assets (CSS, JS, images, partials, login.html)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Authentication Middleware to protect routes
function isAuthenticated(req, res, next) {
    if (req.session && req.session.isAdminLoggedIn) {
        return next();
    }
    res.redirect('/');
}

// 1. Root Route: Serves login.html (or redirects to index if already logged in)
app.get('/', (req, res) => {
    if (req.session && req.session.isAdminLoggedIn) {
        return res.redirect('/index.html');
    }
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// 2. Handle Login Form POST Request
app.post('/login', async (req, res) => {
    const { Username, Password } = req.body;

    try {
        const query = `SELECT * FROM admin WHERE username = $1 AND password = $2`;
        const result = await pool.query(query, [Username, Password]);

        if (result.rows.length > 0) {
            // Set session flags
            req.session.isAdminLoggedIn = true;
            req.session.username = Username;
            
            // Explicitly save session before redirecting to prevent race conditions
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    return res.status(500).send('Internal Server Error');
                }
                res.redirect('/index.html');
            });
        } else {
            // Failed login: alert and force redirect back to login page
            res.send(`
                <script>
                    alert('Invalid Username or Password. Please try again.');
                    window.location.href = '/';
                </script>
            `);
        }
    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).send('Internal Server Error');
    }
});

// 3. Protected Home Page Route (Served securely from /views)
app.get('/index.html', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// 4. Protected Category Page Route (Served securely from /views)
app.get('/category.html', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'category.html'));
});

// INDEX.HTML
// 5. Protected API Endpoint: Categories Summary for Home Page Grid
app.get('/api/categories-summary', isAuthenticated, async (req, res) => {
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

// CATEGORY.HTML
// 6. Protected API Endpoint: Asset Details
app.get('/api/assets', isAuthenticated, async (req, res) => {
    try {
        const categoryId = req.query.categoryId;
        let query = `
            SELECT 
                a.AssetID AS "AssetID", 
                a.PurchaseDate AS "PurchaseDate", 
                a.Manufacturer AS "Manufacturer",
                a.ModelName AS "ModelName", 
                a.SrNumber AS "SrNumber", 
                TRIM(CONCAT(COALESCE(e.EmpfirstName, ''), ' ', COALESCE(e.Emplastname, ''))) AS "EmployeeName",
                c.CategoryName AS "CategoryName"
            FROM Asset a
            LEFT JOIN Employee e ON a.EmpID = e.EmpID
            LEFT JOIN Category c ON a.CategoryID = c.CategoryID
        `;

        let queryParams = [];
        if (categoryId) {
            query += ` WHERE a.CategoryID = $1`;
            queryParams.push(categoryId);
        }
        query += ` ORDER BY a.AssetID;`;

        const result = await pool.query(query, queryParams);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching asset data:', err.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Logout Route
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
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