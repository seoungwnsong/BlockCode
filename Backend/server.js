//Handle https:

const express = require('express');
const cors = require('cors');
const { runProgram } = require('./interpreter');

const app = express();
app.use(cors());
app.use(express.json());

app.post('/check-flow', (req, res) => {
    // #17: without this, a throw falls through to Express's default handler,
    // which returns an HTML error page. The frontend's `await response.json()`
    // then fails and reports a misleading "Connection Error".
    try {
        const output = runProgram(req.body);   // #1: whole body { functions, blocks }
        res.json({ status: 'done', ...output });
    } catch (error) {
        res.status(400).json({
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown interpreter error'
        });
    }
});

// #17 (continued): express.json() rejects malformed bodies BEFORE the route
// runs, and its default handler also replies with HTML. This keeps every
// response on this server JSON, so the frontend's response.json() never blows up.
app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(400).json({
        status: 'error',
        error: error instanceof Error ? error.message : 'Malformed request'
    });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));