const express = require('express');
const app = express();
const cors = require('cors');
const axios = require('axios');
const convert =  require('xml-js');
const puppeteer = require('puppeteer');
const path = require('path');
const rateLimit = require('express-rate-limit');

const port = 8081;

const limiter = rateLimit({
    windowMs: 1000,
    max: 1
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'temp')));
app.use(limiter);

const getPosterUrl = html => {
    const pattern = /(?<=src=")(.*)(?=")/;
    return html.match(pattern)[0];
};

const getRssFeed = async (username, count) => {
    try {
        const url = `https://letterboxd.com/${username}/rss/`;
        const res =  await axios.get(url, { validateStatus: () => true});
        if (res.status === 404) {
            return { error: "Username not found" };
        } else {
            const obj = convert.xml2js(res.data, { compact: true, spaces: 4 });
            const items = obj.rss.channel.item;
            const filmsOnly = items.filter(item => item['letterboxd:watchedDate']).slice(0, count);
            const mappedFilms = filmsOnly.map(film => {
                return {
                    title: film['letterboxd:filmTitle'],
                    watchedDate: film['letterboxd:watchedDate']._text,
                    poster: getPosterUrl(film.description._cdata)
                }
            });
            return mappedFilms;
        }
    } catch (err) {
        if (err) {
            console.log(err);
            return [];
        }
    }
    return [];
}

app.get('/', async (req, res) => {
    res.send("hello there");
});

app.get('/grid', async (req, res) => {
    const data = await getRssFeed(req.query.username, req.query.count);
    console.log(data);
    if (data instanceof Array) {
        res.json({
            data: data,
            success: true
        });
    } else {
        res.json({
            data: [],
            success: false,
            message: data.message || 'Something went wrong'
        })
    }
    
});

app.post('/image', async (req, res) => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.setContent('<html><p>hello</p>' + req.body.node + '</html>');
        await page.waitForSelector('.grid');
        const element = await page.$('.grid');
        await page.evaluate(async () => {
            const selectors = Array.from(document.querySelectorAll("img"));
            await Promise.all(selectors.map(img => {
                if (img.complete) return;
                return new Promise((resolve, reject) => {
                img.addEventListener('load', resolve);
                img.addEventListener('error', reject);
                });
            }));
        });
        const content = await page.content();
        await element.screenshot({path: 'temp/grid.jpg'});
        await browser.close();

        const filePath = path.join(__dirname, 'temp', 'grid.jpg');
        res.download(filePath);
    } catch (e) {
        console.log(e);
    }
    
});

const server = app.listen(port, () => {
    console.log("server is listening!");
});