import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const count = await p.movie.count();
console.log("Movies in DB:", count);
const sample = await p.movie.findFirst({ select: { id: true, tmdbId: true, title: true } });
console.log("Sample movie:", sample);
await p.$disconnect();
