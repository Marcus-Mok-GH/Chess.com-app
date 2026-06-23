const stockfish = require('stockfish');
stockfish().then(eng => {
    console.log('Got engine');
    process.exit(0);
}).catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
