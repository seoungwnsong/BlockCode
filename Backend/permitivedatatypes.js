class Expr {
    evaluate() {}
}

class num extends Expr {
    constructor(number) {
        super();
        this.value = number;
    }
    evaluate() { return this.value; }
    toString() { return `${this.value}`; }
}

class Booleans extends Expr {
    constructor(value) {
        super();
        this.value = value;
    }
    evaluate() { return this.value; }
    toString() { return `${this.value}`; }
}

class Strings extends Expr {
    constructor(text) {
        super();
        this.value = text;
    }
    evaluate() { return this.value; }
    toString() { return this.value; }
}

module.exports = { Expr, num, Booleans, Strings };