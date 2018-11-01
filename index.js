const rp = require('request-promise');
const cheerio = require('cheerio');
const fs = require('fs');
const _ = require('lodash');

let allMovies = [];
let srcMovieId = process.argv[2];
let srcMovieName = '';

if (!srcMovieId)
    console.error("Please provide a valid movie id!");

async function crawlActorsOfMovie() {
    let actors = [];

    return rp(`https://www.imdb.com/title/${srcMovieId}/fullcredits`)
        .then((html) => {
            const $ = cheerio.load(html);

            srcMovieName = $('#main > div.article.listo > div.subpage_title_block > div > h3 > a').text();

            $('.cast_list').find('tbody tr').each(function() {
                let scnChild = $(this).children('td:nth-child(2)');
                let actorName = decodeURIComponent(scnChild.text()).toString().trim();
                let actorId = decodeURIComponent(scnChild.html()).toString().split('/');

                if (actorId[2] == undefined) return;

                actors.push({
                    id: actorId[2],
                    name: actorName
                })
            });

            console.log(`Movie contains ${actors.length} actors`);
            return actors;
        })
        .catch((err) => {
            return [];
        });
};

async function crawlMoviesForActors() {
    let actors = await crawlActorsOfMovie();
    let completeActors = [];
    let promises = [];

    actors.forEach(actor => {
        let movies = [];
        promises.push(rp(`https://www.imdb.com/name/${actor.id}/`)
            .then((html) => {
                const $ = cheerio.load(html);

                $('.filmo-category-section').find('div[id^="actor"] b').each(function() {
                    let movieId = decodeURIComponent($(this).html()).split('/')[2];
                    let movie = $(this).text();

                    if (movieId != srcMovieId) {
                        movies.push(movie);
                        allMovies.push(movie);
                    }
                });

                let obj = {
                    id: actor.id,
                    name: actor.name,
                    movies
                };

                completeActors.push(obj);

            })
            .catch((err) => {
                return;
            }));
    });

    return Promise.all(promises)
        .then(_ => {
            console.log('done');

            return completeActors;
        });
};

async function exportGraph() {
    let actors = await crawlMoviesForActors();
    let movies = _.uniq(allMovies);
    let dict = {};

    for (let i = 0; i < movies.length; i++) {
        dict[movies[i]] = i;
    }

    const wstream = fs.createWriteStream(`${srcMovieId}.gexf`);
    wstream.write('<?xml version="1.0" encoding="UTF-8"?>');
    wstream.write('<gexf xmlns="http://www.gexf.net/1.2draft" version="1.2">');
    wstream.write('<meta lastmodifieddate="2009-03-20">');
    wstream.write('<creator>IMDB Crawler</creator>');
    wstream.write('<description>IMDB Movie Graph</description>');
    wstream.write('</meta>');
    wstream.write('<graph mode="static" defaultedgetype="directed">');
    wstream.write('<attributes class="edge" mode="static">');
    wstream.write('<attribute id="3" title="relation" type="string" />');
    wstream.write('</attributes>');
    wstream.write('<attributes class="node" mode="static">');
    wstream.write('<attribute id="0" title="type" type="string" />');
    wstream.write('<attribute id="1" title="title" type="string" />');
    wstream.write('<attribute id="2" title="name" type="string" />');
    wstream.write('</attributes>');

    // add all nodes
    wstream.write('<nodes>');
    movies.forEach(movie => {
        let movieName = decodeURIComponent(movie).replace(/&/g, '');;
        wstream.write(`<node id="${dict[movie]}" label="${movieName}">`);
        wstream.write(`<attvalues>`);
        wstream.write(`<attvalue for="0" value="movie" />`);
        wstream.write(`<attvalue for="1" value="${movieName}" />`);
        wstream.write(`<attvalue for="2" value="${movieName}" />`);
        wstream.write(`</attvalues>`);
        wstream.write('</node>');
    });

    // srcMovie
    wstream.write(`<node id="${srcMovieId}" label="${srcMovieName}">`);
    wstream.write(`<attvalues>`);
    wstream.write(`<attvalue for="0" value="movie" />`);
    wstream.write(`<attvalue for="1" value="${srcMovieName}" />`);
    wstream.write(`<attvalue for="2" value="${srcMovieName}" />`);
    wstream.write(`</attvalues>`);
    wstream.write('</node>');

    // actors
    actors.forEach(actor => {
        wstream.write(`<node id="${actor.id}" label="${actor.name}">`);
        wstream.write(`<attvalues>`);
        wstream.write(`<attvalue for="0" value="actor" />`);
        wstream.write(`<attvalue for="2" value="${actor.name}" />`);
        wstream.write(`</attvalues>`);
        wstream.write('</node>');
    });
    wstream.write('</nodes>');

    // add all edges
    wstream.write('<edges>');
    let id = 0;
    actors.forEach(actor => {
        // add the source Movie - not all actors had the source movie listed
        wstream.write(`<edge id="${id++}" source="${actor.id}" target="${srcMovieId}">`);
        wstream.write(`<attvalues>`);
        wstream.write(`<attvalue for="3" value="acted_in" />`);
        wstream.write(`</attvalues>`);
        wstream.write('</edge>');

        actor.movies.forEach(movie => {
            wstream.write(`<edge id="${id++}" source="${actor.id}" target="${dict[movie]}">`);
            wstream.write(`<attvalues>`);
            wstream.write(`<attvalue for="3" value="acted_in" />`);
            wstream.write(`</attvalues>`);
            wstream.write('</edge>');
        });
    });
    wstream.write('</edges>');

    wstream.write('</graph>');
    wstream.write('</gexf>');
    wstream.end();


};

exportGraph();