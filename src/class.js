(function(){

    var root = typeof window !== 'undefined' ? window : this;

    var traceur  = root.traceur  || (typeof require !== 'undefined' && require('traceur')),
        Mustache = root.Mustache || (typeof require !== 'undefined' && require('mustache')),
        util     = root.util     || (typeof require !== 'undefined' && require('util')),
        vm       = root.vm       || (typeof require !== 'undefined' && require('vm'));

    var Project              = traceur.semantics.symbols.Project,
        SourceFile           = traceur.syntax.SourceFile,
        Parser               = traceur.syntax.Parser,
        ErrorReporter        = traceur.util.ErrorReporter,
        TreeWriter           = traceur.outputgeneration.TreeWriter,
        ParseTreeTransformer = traceur.codegeneration.ParseTreeTransformer,
        ProgramTransformer   = traceur.codegeneration.ProgramTransformer,
        ParseTreeFactory     = traceur.codegeneration.ParseTreeFactory;
        ParseTreeTypes       = traceur.syntax.trees.ParseTreeType,
        TokenType            = traceur.syntax.TokenType;

    var EMPTY_STATEMENT  = 'EMPTY_STATEMENT',//ParseTreeTypes.EMPTY_STATEMENT,
        SUPER_EXPRESSION = 'SUPER_EXPRESSION',//ParseTreeTypes.SUPER_EXPRESSION,
        SET_ACCESSOR     = 'SET_ACCESSOR',//ParseTreeTypes.SET_ACCESSOR,
        GET_ACCESSOR     = 'GET_ACCESSOR';//ParseTreeTypes.GET_ACCESSOR;

    var STRING = TokenType.STRING;

    var createEmptyStatement          = ParseTreeFactory.createEmptyStatement,
        createObjectLiteralExpression = ParseTreeFactory.createObjectLiteralExpression,
        createBlock                   = ParseTreeFactory.createBlock,
        createThisExpression          = ParseTreeFactory.createThisExpression,
        createArgumentList            = ParseTreeFactory.createArgumentList,
        createLabelledStatement       = ParseTreeFactory.createLabelledStatement,
        createFunctionExpression      = ParseTreeFactory.createFunctionExpression,
        createEmptyParameterList      = ParseTreeFactory.createEmptyParameterList,
        createCommaExpression         = ParseTreeFactory.createCommaExpression;

    function BEMClassTransformer(errorReporter) {
        this._useBEM = false;
        this._errorReporter = errorReporter;
        ParseTreeTransformer.apply(this,arguments);
    }
    util.inherits(BEMClassTransformer,ParseTreeTransformer);

    var $super = ParseTreeTransformer.prototype;

    // "use bem";
    // 'use bem';
    BEMClassTransformer.prototype.transformExpressionStatement = function (tree) {
        var token = tree.expression ? tree.expression.literalToken : null;
        if ( token &&
             token.type === STRING &&
             vm.runInNewContext(token.value) === 'use bem' ) {
            this._useBEM = true;
            return createEmptyStatement();
        }
        return $super.transformExpressionStatement.apply(this,arguments);
    }

    // remove empty statements from function bodies
    BEMClassTransformer.prototype.transformFunctionBody = function (tree) {
        this._removeEmptyExpressions(tree.statements);
        return $super.transformFunctionBody.apply(this,arguments);
    }

    // remove empty statements from blocks
    BEMClassTransformer.prototype.transformBlock = function (tree) {
        this._removeEmptyExpressions(tree.statements);
        return $super.transformBlock.apply(this,arguments);
    }

    // remove empty statements from program
    BEMClassTransformer.prototype.transformProgram = function (tree) {
        this._removeEmptyExpressions(tree.programElements);
        return $super.transformProgram.apply(this,arguments);
    }

    //
    BEMClassTransformer.prototype._removeEmptyExpressions = function (tree) {
        var me = this;
        tree.forEach(function(element,index){
            if ( element.isStatement() ) {
                tree[index] = me.transformExpressionStatement(element);
                if ( tree[index].type == EMPTY_STATEMENT ) {
                    tree.splice(index,1);
                }
            }
        });
    }

    //
    BEMClassTransformer.prototype._transformBlock = function (tree) {
        return this.transformBlock(tree);
    }

    var BEM_CLASS_TEMPLATE =
        'BEM{{#bemDom}}.DOM{{/bemDom}}.decl(' +
            '{{^superClassName}}\'{{className}}\'{{/superClassName}}' +
            '{{#superClassName}}{' +
            'block: \'{{className}}\', ' +
            '{{#modName}}modName: \'{{modName}}\', modValue: \'{{modValue}}\', {{/modName}}' +
            'baseBlock: \'{{superClassName}}\'}{{/superClassName}}' +
        ',' +
            '{{&members}}' +
        '{{#staticMembersLength}}, {{&membersStatic}} {{/staticMembersLength}})';

    var BEM_CLASS_ON_SET_MOD_TEMPLATE =
        'onSetMod: {' +
        '}';

    var BEM_SUPER_EXPRESSION_TEMPLATE =
        'this.__base.apply(this,arguments)';

    var BEM_SUPER_EXPRESSION_NO_ARGS_TEMPLATE =
        'this.__base.call(this)';

    var BEM_SUPER_EXPRESSION_ARGS_TEMPLATE =
        'this.__base.call{{arguments}}';

    //
    BEMClassTransformer.prototype._renderTree = function ( pseudoFileName, content ) {
        var sourceFile = new SourceFile(pseudoFileName,content),
            parser     = new Parser(this._errorReporter, sourceFile);
        return parser.parseProgram();
    }

    // super; => this.__base.apply(this,arguments)
    BEMClassTransformer.prototype.transformSuperExpression = function (tree) {
       if ( !this._useBEM ) {
           return $super.transformSuperExpression.apply(this,arguments);
       }
       return this._renderTree(
           'bem-class-super.js',
           BEM_SUPER_EXPRESSION_TEMPLATE
       ).programElements[0].expression;
    }

    // super();          => this.__base.call(this);
    // super(arg1,arg2); => this.__base.call(this,arg1,arg2);
    BEMClassTransformer.prototype.transformCallExpression = function (tree) {
       var a;
       if ( !this._useBEM ) {
           return $super.transformCallExpression.apply(this,arguments);
       }
       if ( tree.operand &&
            tree.operand.type === SUPER_EXPRESSION ) {
           if ( tree.args &&
                tree.args.args &&
                tree.args.args.length ) {
               a = createArgumentList([createThisExpression()].concat(tree.args.args));
               return this._renderTree(
                   'bem-class-super-expression.js',
                   Mustache.render(BEM_SUPER_EXPRESSION_ARGS_TEMPLATE,{
                       arguments : TreeWriter.write(a).trim()
                   })
               ).programElements[0].expression;
           } else {
               return this._renderTree(
                   'bem-class-super-expression-no-args.js',
                   BEM_SUPER_EXPRESSION_NO_ARGS_TEMPLATE
               ).programElements[0].expression;
           }
       }
       return $super.transformCallExpression.apply(this,arguments);
    }

    // var SomeClass = class { ... }                                     => BEM.decl('some-class',{ ... })
    // var SomeClass = class extends BEM { ... }                         => BEM.decl('some-class',{ ... })
    // var SomeClass = class extends BEM.DOM { ... }                     => BEM.DOM.decl('some-class',{ ... })
    // var SomeClass = class extends BStatCounter { ... }                => BEM.decl({ block: 'some-class', baseBlock : 'b-statcounter' },{ ... })
    // var SomeClass = class extends BEM.blocks['b-statcounter'] { ... } => BEM.decl({ block: 'some-class', baseBlock : 'b-statcounter' },{ ... })
    BEMClassTransformer.prototype.transformClassExpression = function ( tree, className, superClassName ) {
        if ( !this._useBEM ) {
            return $super.transformClassExpression.apply(this,arguments);
        }

        var superClassName;

        if ( tree.superClass ) {
            superClassName = TreeWriter.write(tree.superClass).trim();
        } else {
            superClassName = 'BEM';
        }

       return this._transformClassShared(tree,null,superClassName);
    }

    // class SomeClass { ... }                                     => BEM.decl('some-class',{ ... })
    // class SomeClass extends BEM { ... }                         => BEM.decl('some-class',{ ... })
    // class SomeClass extends BEM.DOM { ... }                     => BEM.DOM.decl('some-class',{ ... })
    // class SomeClass extends BStatCounter { ... }                => BEM.decl({ block: 'some-class', baseBlock : 'b-statcounter' },{ ... })
    // class SomeClass extends BEM.blocks['b-statcounter'] { ... } => BEM.decl({ block: 'some-class', baseBlock : 'b-statcounter' },{ ... })
    BEMClassTransformer.prototype.transformClassDeclaration = function ( tree ) {
        if ( !this._useBEM ) {
            return $super.transformClassDeclaration.apply(this,arguments);
        }

        var className      = 'Class',
            superClassName = null;

        if ( tree.name && tree.name.identifierToken ) {
            className = tree.name.identifierToken.value;
        }

        if ( tree.superClass ) {
            superClassName = TreeWriter.write(tree.superClass).trim();
        } else {
            superClassName = 'BEM';
        }

        return this._transformClassShared(tree,className,superClassName);
    }

    // SomeClassName => some-class-name
    BEMClassTransformer.prototype._transformClassName = function ( className, modsExport ) {
        var p = className.indexOf('_'),
            m;
        if ( p !== -1 ) {
            if ( modsExport ) {
               m = className.substring(p+1).split('_');
               if ( m.length >= 2 ) {
                   modsExport.name  = m[0];
                   modsExport.value = m[1];
               }
            }
            className = className.substring(0,p);
        }
        return className.replace(/([A-Z])/g, function($1, p1, p2){
            return (p2 ? '-' : '') + $1.toLowerCase();
        });
    }

    // common class transformer
    BEMClassTransformer.prototype._transformClassShared = function (tree, className, superClassName) {
        var modsExport = {};
        className = this._transformClassName(className, modsExport);

        var bemDom = superClassName === 'BEM.DOM' ? true : false,
            me = this;

        if ( superClassName === 'BEM' || superClassName === 'BEM.DOM' ) {
            superClassName = null;
        } else if ( superClassName.indexOf('BEM.blocks') === -1 ) {
            superClassName = this._transformClassName(superClassName);
        } else {
            superClassName = superClassName.match(/BEM\.blocks\[(\'|\")(.*)(\'|\")\]/)[2];
        }

        var ctor,
            onSetMod,
            mods          = [],
            members       = [],
            staticMembers = [];

        if ( tree.elements ) {
               tree.elements.forEach(function(element,index){
                   var name = element.name.literalToken.value,
                       st   = element.isStatic;
                   if ( element.type === SET_ACCESSOR ) {
                       element.body = me._transformBlock(element.body);
                       mods.push(createLabelledStatement(name,createFunctionExpression(
                           createEmptyParameterList(),
                           element.body
                       )));
                       return;
                   } else if ( element.type === GET_ACCESSOR ) {
                       return;
                   }
                   element.functionBody = me._transformBlock(element.functionBody);
                   /*
                   if ( name !== 'constructor' ) {
                       element =
                           createLabelledStatement(
                               name,
                               createFunctionExpression(
                                   element.formalParameterList,
                                   element.functionBody
                               )
                           );
                   }
                   */
                   //if ( name !== 'constructor' ) {
                       element =
                           createLabelledStatement(
                               name === 'constructor' ? '__' + name : name,
                               createFunctionExpression(
                                   element.formalParameterList,
                                   element.functionBody
                               )
                           );
                   //}
                   if ( st ) {
                       staticMembers.push(element);
                   } else {
                       /*
                       if ( name === 'constructor' ) {
                           ctor = createFunctionExpression(
                               element.formalParameterList,
                               element.functionBody
                           );
                       } else {
                       */
                           members.push(element);
                       /*
                       }
                       */
                   }
               });
        }

        /*
        if ( ctor || mods.length ) {
            var m = [];
            onSetMod = this._renderTree(
                'bem-class-on-set-mod.js',
                BEM_CLASS_ON_SET_MOD_TEMPLATE
            ).programElements[0];
            if ( ctor ) {
                m.push(createLabelledStatement('js',ctor));
            }
            mods.forEach(function(element){
                m.push(element);
            });
            onSetMod.statement.statements.push(createCommaExpression(m));
            members.unshift(onSetMod);
        }
        */

        if ( mods.length ) {
            var m = [];
            onSetMod = this._renderTree(
                'bem-class-on-set-mod.js',
                BEM_CLASS_ON_SET_MOD_TEMPLATE
            ).programElements[0];
            mods.forEach(function(element){
                m.push(element);
            });
            onSetMod.statement.statements.push(createCommaExpression(m));
            members.unshift(onSetMod);
        }

        if ( members.length > 0 ) {
            try {
                members = TreeWriter.write(createObjectLiteralExpression(members)).trim();
            } catch ( e ) {
                this._errorReporter.reportError('Class compiler',e.stack);
                return createEmptyStatement();
            }
        } else {
            members = '{}';
        }

        if ( staticMembers.length > 0 ) {
            try {
                staticMembers = TreeWriter.write(createObjectLiteralExpression(staticMembers)).trim();
            } catch ( e ) {
                this._errorReporter.reportError('Class compiler',e.stack);
                return createEmptyStatement();
            }
        } else {
            staticMembers = '';
        }

        var content = Mustache.render(BEM_CLASS_TEMPLATE,{
            bemDom              : bemDom,
            className           : className,
            superClassName      : superClassName,
            membersLength       : members.length,
            staticMembersLength : staticMembers.length,
            members             : members,
            membersStatic       : staticMembers,
            modName             : modsExport.name,
            modValue            : modsExport.value
        });

        try {
            newTree = this._renderTree('bem-class.js',content);
        } catch ( e ) {
            this._errorReporter.reportErrorSource(content);
            this._errorReporter.reportError('Class compiler',e.stack);
            return createEmptyStatement();
        }

        if ( this._errorReporter.hadError() ) {
            this._errorReporter.reportErrorSource(content);
            return createEmptyStatement();
        }

        return newTree;
    }

    if ( typeof module !== 'undefined' && module.exports ) {
        module.exports = {
            BEMClassTransformer : BEMClassTransformer
        };
    }

    root.BNCompiler = root.BNCompiler || {};
    root.BNCompiler.BEMClassTransformer = BEMClassTransformer;

}).call(this);
