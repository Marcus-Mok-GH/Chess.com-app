const stockfish = require('stockfish');

async function testFinal() {
  console.log('Final Validation...');

  const result = await new Promise((resolve, reject) => {
    let resolved = false;
    let engine = null;

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
      engine = eng;
      eng.sendCommand('uci');
      eng.sendCommand('position startpos');
      eng.sendCommand('go depth 1');
    }).catch(error => {
      if (!resolved) {
        resolved = true;
        if (engine) {
          try { engine.terminate(); } catch(e) {}
        }
        reject(error);
      }
    });

    setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (engine) {
            try { engine.terminate(); } catch(e) {}
          }
          reject(new Error('Timeout'));
        }
    }, 10000);
  });

  console.log('Result:', result);
  process.exit(0);
}

testFinal().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
