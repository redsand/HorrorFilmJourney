import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const ids = [12487,998476,1615581,1517297,39995,985031,553720,22538,16303,4772,4031,762,5651,6471,11379,8764,13446,4507,109,1527781,11891,10074,45649,27033,19542,11481,20620,1480881,18333,40149,29722,837,43353,10513,32307,42794,31383,74849,49069,26011,50719,20196,15618,26914,415,9405,5491,31130,17473,84297,40016,17346,26719,55149,60801,36351,26564,110,10548,309,550,8374,1359,3134,575,10775,11194,187,1949,893113,558152];
const movies = await prisma.movie.findMany({ where: { tmdbId: { in: ids } }, select: { tmdbId: true, title: true, year: true } });
console.log(JSON.stringify(movies.sort((a, b) => ids.indexOf(a.tmdbId) - ids.indexOf(b.tmdbId)), null, 2));
await prisma.$disconnect();
