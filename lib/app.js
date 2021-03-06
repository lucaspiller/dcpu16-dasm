var program   = require('commander')
var path      = require('path')
var fs        = require('fs')
var glob      = require("glob")
var Assembler = require('./assembler')

program
  .version('0.0.1')
  .usage('[options] <input> [<output>]')
  .description('Assembles input into DCPU-16 bytecode')

program.on('--help', function(){
  console.log('  output defaults to input with the .dcpu extension')
  console.log('')
  console.log('  Examples:')
  console.log('')
  console.log('    $ dasm fib.dasm         # Compile fib.dasm to fib.dcpu')
  console.log('    $ dasm fib.dasm fib.hex # Compile fib.dasm to fib.hex')
  console.log('')
});

function includeFiles(inputFile) {
  var basePath = path.dirname(inputFile) + '/'
  var matches  = glob.sync(basePath + "**/*.dasm");

  var includeFiles = {};
  matches.forEach(function(includeFile) {
    if (includeFile !== inputFile) {
      var incPath = includeFile.replace(basePath, '').replace('.dasm', '');
      includeFiles[incPath] = fs.readFileSync(includeFile, 'utf8');
    }
  });

  return includeFiles;
}

function compile(inputFile, outputFile) {
  fs.readFile(inputFile, 'utf8', function (err, data) {
    if (err) {
      return console.log(err);
    }

    var listing = Assembler.compileSource(data, includeFiles(inputFile))
    for (var i = 0; i < listing.errors.length; i++) {
      console.error(listing.errors[i]);
    }

    var ws = fs.createWriteStream(outputFile)
    var bytecode = listing.bytecode()
    for (var i = 0; i < bytecode.length; i++) {
      // write in little endian format
      var low  = bytecode[i] >> 8
      var high = bytecode[i]

      ws.write(new Buffer([low, high]))
    }

    console.log(listing.bytecodeText())

    ws.end()

    console.log('Wrote', outputFile)
  })
}

function run() {
  program.parse(process.argv);

  if (program.args.length < 1 || program.args.length > 2) {
    program.outputHelp();
    process.exit(1);
  }

  var inputFile  = program.args[0];
  var outputFile = program.args[1];

  if (!outputFile) {
    outputFile = inputFile.replace(path.extname(inputFile), '.dcpu')
  }

  compile(inputFile, outputFile);
}

module.exports = run;
