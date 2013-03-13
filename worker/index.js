var fork = require('child_process').fork;
var proc = null;

exports.startWorker = function() {
  proc = fork(__dirname + '/kue_process_main.js');

  proc.on('error', function(err) {
    console.log('Kue child process ', proc.pid, ' failed with error: ', err);
    proc.disconnect();
    process.exit(1);
/*    process.nextTick(function() {
      proc = fork(process.cwd() + '/kue_process_main.js');
    });
*/
  });

  proc.on('exit', function(code, signal) {
    console.log('Kue child process ', proc.pid,' exited with: ', code, signal);
    proc.disconnect();
  });

  proc.on('close', function() {
    console.log('Kue child process ', proc.pid, ' closed');
    proc.disconnect();
    process.nextTick(function() {
      proc = fork(process.cwd() + '/kue_process_main.js');
    });
  });
}
