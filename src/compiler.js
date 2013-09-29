(function(){

    var root = typeof window !== 'undefined' ? window : this;

    var traceur = root.traceur || (typeof require !== 'undefined' && require('traceur')),
        util    = root.util    || (typeof require !== 'undefined' && require('util'));

    var Project             = traceur.semantics.symbols.Project,
        SourceFile          = traceur.syntax.SourceFile,
        Parser              = traceur.syntax.Parser,
        ErrorReporter       = traceur.util.ErrorReporter,
        TreeWriter          = traceur.outputgeneration.TreeWriter,
        ProgramTransformer  = traceur.codegeneration.ProgramTransformer,
        BEMClassTransformer = root &&
                              root.BNCompiler &&
                              root.BNCompiler.BEMClassTransformer ||
                              (typeof require !== 'undefined' && require('./class').BEMClassTransformer);

    // Special class for error reporting
    function BEMErrorReporter(){
        ErrorReporter.apply(this,arguments);
    };
    util.inherits(BEMErrorReporter,ErrorReporter);
    BEMErrorReporter.prototype.reportErrorSource = function(source) {
        this._errorSource = source;
    }
    BEMErrorReporter.prototype.reportError = function (position, message) {
        if ( !this._errorBuffer ) {
            this._errorBuffer = [];
        }
        this._errorBuffer.push(message + ', ' + position);
        ErrorReporter.prototype.reportError.apply(this,arguments);
    }
    BEMErrorReporter.prototype.reportMessageInternal = function(location, format, args) {};
    BEMErrorReporter.prototype.getLastError = function () {
        return this._errorBuffer.join('\n');
    }
    BEMErrorReporter.prototype.getErrorSource = function () {
        return this._errorSource;
    }

    var errorReporter,
        compile = function ( fileName, fileContent ) {
            errorReporter = new BEMErrorReporter();

            var project    = new Project('//'),
                sourceFile = new SourceFile(fileName,fileContent),
                parser     = new Parser(errorReporter,sourceFile),
                program;

            try {
                program = parser.parseProgram(true);
            } catch ( e ) {
                errorReporter.reportError('parse',e.stack);
                return null;
            }

            if ( errorReporter.hadError() ) {
                return null;
            }

            project.addFile(sourceFile);
            project.setParseTree(sourceFile,program);

            try {
               program = (new BEMClassTransformer(errorReporter)).transformAny(program);
               project.setParseTree(sourceFile,program);
               program = ProgramTransformer.transformFile( errorReporter, project, sourceFile );
            } catch ( e ) {
               errorReporter.reportError('transform',e.stack);
               return null;
            }

            if ( errorReporter.hadError() ) {
                return null;
            }

            if ( !program ) {
                return '';
            }

            return TreeWriter.write(program.get(sourceFile));
        },

        getLastError = function () {
            return errorReporter.getLastError();
        },

        getErrorSource = function () {
            return errorReporter.getErrorSource();
        };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            compile : compile,
            getLastError : getLastError,
            getErrorSource : getErrorSource
        }
    }

    root.BNCompiler = root.BNCompiler || {};
    root.BNCompiler.compile = compile;
    root.BNCompiler.getLastError = getLastError;
    root.BNCompiler.getErrorSource = getErrorSource;

}).call(this);
