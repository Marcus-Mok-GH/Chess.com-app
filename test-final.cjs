const stockfish = require('stockfish');

async function testFinal() {
  console.log('Final Validation...');

  const result = await new Promise((resolve, reject) => {
    let resolved = false;
    stockfish(null, {
      listener: (line) => {
        console.log('[Output]', line);
        if (line.startsWith('bestmove')) {
          if (!resolved) {
            resolved = true;
            resolve(line);
          }
        }
      }
    }).then(eng => {
      eng.sendCommand('uci');
      eng.sendCommand('position startpos');
      eng.sendCommand('go depth 1');
    });

    setTimeout(() => {
        if (!resolved) reject(new Error('Timeout'));
    }, 10000);
  });

  console.log('Result:', result);
  process.exit(0);
}

testFinal();
