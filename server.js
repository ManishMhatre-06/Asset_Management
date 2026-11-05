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

app.get('/profile.html', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'profile.html'));
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
// Dynamic Protected API Endpoint: Asset Details with Auto-Discovery of Sub-Table Columns
app.get('/api/assets', isAuthenticated, async (req, res) => {
    try {
        const categoryId = req.query.categoryId;
        if (!categoryId) {
            return res.status(400).json({ error: 'CategoryID is required' });
        }

        // 1. Fetch the category name to identify the corresponding sub-table
        const catRes = await pool.query('SELECT categoryname FROM category WHERE categoryid = $1', [categoryId]);
        if (catRes.rows.length === 0) {
            return res.status(404).json({ error: 'Category not found' });
        }
        const rawCategoryName = catRes.rows[0].categoryname;
        // Sanitize and format table name (e.g., 'Laptop' -> 'laptop')
        const tableName = rawCategoryName.toLowerCase().replace(/[^a-z0-9_]/g, '');

        // 2. Check if a sub-table matching this category name exists in the database
        const tableCheck = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = $1
        `, [tableName]);

        let subTableColumns = [];
        let hasSubTable = tableCheck.rows.length > 0;

        if (hasSubTable) {
            // Automatically fetch all unique columns of this sub-table (excluding foreign key 'assetid')
            const colRes = await pool.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_schema = 'public' AND table_name = $1 AND column_name <> 'assetid'
                ORDER BY ordinal_position
            `, [tableName]);
            subTableColumns = colRes.rows.map(r => r.column_name);
        }

        // 3. Construct base SELECT for common fields
        let selectCols = `
            a.assetid AS "Asset ID", 
            a.purchasedate AS "Purchase Date", 
            a.manufacturer AS "Manufacturer", 
            a.modelname AS "Model Name", 
            a.srnumber AS "Serial Number",
            TRIM(CONCAT(COALESCE(e.empfirstname, ''), ' ', COALESCE(e.emplastname, ''))) AS "Employee Name",
            c.categoryname AS "Category Name"
        `;

        let fromClause = `
            FROM asset a
            JOIN category c ON a.categoryid = c.categoryid
            JOIN employee e ON a.empid = e.empid
        `;

        // 4. If a sub-table exists, dynamically append its unique columns and LEFT JOIN it
        if (hasSubTable) {
            subTableColumns.forEach(col => {
                // Convert snake_case column names into Title Case for clean display (e.g., 'os_version' -> 'Os Version')
                const formattedColName = col
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, l => l.toUpperCase());
                selectCols += `, t.${col} AS "${formattedColName}"`;
            });
            fromClause += ` LEFT JOIN ${tableName} t ON a.assetid = t.assetid`;
        }

        const query = `SELECT ${selectCols} ${fromClause} WHERE a.categoryid = $1 ORDER BY a.assetid;`;
        const result = await pool.query(query, [categoryId]);
        res.json(result.rows);

    } catch (err) {
        console.error('Error fetching dynamic asset data:', err.message);
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