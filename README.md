BEM.Sugar
=========

Sugar for BEM:

* Classes Declaration
* Super Expression
* Arrow Functions
* Default Parameters
* Spread Parameter
* Destruction Assigment
* Play with syntax at: http://greenpoint.github.io/bn/

Command line
------------

```
Usage: bn <file ...> [options]

  Options:

    -h, --help     output usage information
    -V, --version  output the version number
    -o, --output   Specify output file
```

Node.js
-------

```
   var bn = require('bem-next');
   bn.compile(
      `"use bem";
       class foo {}`
   ); // output: BEM.decl('foo',{});
```

Questions?
----------

* greendizer at yandex-team
* point.green@gmail.com
