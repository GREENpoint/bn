var compiler  = require('./src/compiler'),
    commander = require('commander'),
    path      = require('path'),
    fs        = require('fs');

commander
    .version('0.1.0')
    .usage('<file ...> [options]')
    .option('-o, --output', 'Specify output file')
    .parse(process.argv);

if ( commander.args.length == 0 ) {
    console.log('Please specify input file...');
    process.exit(0);
}

var fileName = commander.args[0],
    outputFileName = commander.output || path.basename(fileName,'.js') + '.output.js',
    fileContent,
    outputFileContent;

try {
    fileContent = fs.readFileSync(fileName,{
        encoding: 'utf-8'
    });
} catch ( e ) {
    console.log('Couldn\'t read "' + fileName + '"...');
    process.exit(0);
}

outputFileContent = compiler.compile(fileName,fileContent);
if ( outputFileContent === null ) {
    console.log('Couldn\'t compile "' + fileName + '":');
    console.log(compiler.getLastError());
    process.exit(0);
}

try {
    fs.writeFileSync(outputFileName,outputFileContent,{
        encoding : 'utf-8'
    });
} catch ( e ) {
    console.log('Couldn\'t write file...');
    process.exit(0);
}

process.exit(1);
