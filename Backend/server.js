const express = require('express');
const cors = require('cors');        // add this
const app = express();

app.use(cors());                     // add this
app.use(express.json());

class Expr_Num{
    constructor(num){
         this.n=num
    }
    evaluate(){
        return this.n
    } 
    toString(){
        return str(this.n)
    }
}
app.post('/check-flow', (req, res) => {
    const blocks = req.body.blocks;
    const env = {};
    res.json({
        status: 'received',
        blockCount: blocks.length
    });
});

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
