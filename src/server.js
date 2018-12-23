const express = require('express')
const app = express()
const port = 3100
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.get('/', (req, res) => res.send('RxJs File Chunker - Mock API'))

app.post('/upload', function (req, res) {
    console.log('file uploaded');
    res.send('OK');
});

app.listen(port, () => console.log(`File Uploader app listening on port ${port}!`))