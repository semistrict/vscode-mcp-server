const express = require('express');

const app = express();
const port = process.env.PORT || 16211;

// Simple route for testing
app.get('/', (req, res) => {
    res.json({ message: 'Hello, debugging world!' });
});

app.get('/users/:id', (req, res) => {
    const id = parseInt(req.params.id);
    
    // Some code to set breakpoints on
    const user = {
        id: id,
        name: `User ${id}`,
        email: `user${id}@example.com`
    };
    
    if (id > 100) {
        res.status(404).json({ error: 'User not found' });
        return;
    }
    
    res.json(user);
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});