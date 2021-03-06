class Util {

  /*
    Utilizing https://stackoverflow.com/a/45332959 to have multiple class inheritance
  */
  aggregation(baseClass, ...mixins) {
    class base extends baseClass {
      constructor(...args) {
        super(...args);
        mixins.forEach((mixin) => {
          copyProps(this, (new mixin));
        });
      }
    }

    // this function copies all properties and symbols, filtering out some special ones
    let copyProps = (target, source) => {
      Object.getOwnPropertyNames(source)
        .concat(Object.getOwnPropertySymbols(source))
        .forEach((prop) => {
          if (!prop.match(/^(?:constructor|prototype|arguments|caller|name|bind|call|apply|toString|length)$/))
            Object.defineProperty(target, prop, Object.getOwnPropertyDescriptor(source, prop));
        })
    };

    // outside contructor() to allow aggregation(A,B,C).staticFunction() to be called etc.
    mixins.forEach((mixin) => {
      copyProps(base.prototype, mixin.prototype);
      copyProps(base, mixin);
    });
    return base;
  }

}
module.exports = new Util();
