// Copyright (C) 2026 Erik Landvall
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and LICENSE-ADDITIONAL-TERMS.
export const typeLibraries=[
  {id:'browser',name:'Browser / DOM',description:'Browser globals, DOM, events and web APIs.'},
  {id:'webworker',name:'Web Workers',description:'Worker globals, messaging and worker web APIs.'},
  {id:'node',name:'Node.js',description:'Node globals and built-in modules, including required Undici types.'},
  {id:'scripthost',name:'ScriptHost',description:'Legacy Windows Script Host declarations.'},
] as const;
export type TypeLibraryChoices=Record<string,boolean>;
export function isNpmPackageName(name:string):boolean{
  return name.length<=214&&/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name);
}
export function npmTypeId(name:string):string{return `npm:${name}`;}
export function npmTypeName(id:string):string|undefined{
  const name=id.startsWith('npm:')?id.slice(4):'';return isNpmPackageName(name)?name:undefined;
}
export const commonTypeLibraries=[
  {name:'@types/react',description:'React components, hooks and JSX.',group:'React'},
  {name:'@types/react-dom',description:'React DOM rendering and browser integration.',group:'React'},
  {name:'@types/ws',description:'Node.js WebSocket clients and servers.',group:'Node.js'},
  {name:'@types/express',description:'Express requests, responses, routing and middleware.',group:'Servers'},
  {name:'@types/koa',description:'Koa applications, contexts and middleware.',group:'Servers'},
  {name:'@types/cors',description:'CORS middleware.',group:'Middleware'},
  {name:'@types/express-session',description:'Express sessions and session storage.',group:'Middleware'},
  {name:'@types/passport',description:'Passport authentication middleware.',group:'Authentication'},
  {name:'@types/jsonwebtoken',description:'JSON Web Token signing and verification.',group:'Authentication'},
  {name:'@types/bcrypt',description:'Password hashing APIs.',group:'Authentication'},
  {name:'@types/pg',description:'PostgreSQL clients, queries and connection pools.',group:'Databases'},
  {name:'@types/lodash',description:'Lodash collection and utility functions.',group:'Utilities'},
  {name:'@types/jest',description:'Jest test globals, assertions and mocks.',group:'Testing'},
  {name:'@types/mocha',description:'Mocha test suites and hooks.',group:'Testing'},
  {name:'@types/chai',description:'Chai assertions.',group:'Testing'},
  {name:'@types/angular',description:'Legacy AngularJS 1.x. Modern Angular includes its own types.',group:'Legacy'},
  {name:'mysql2',description:'Included MySQL2 connection, pool, query and promise API declarations.',group:'Included types'},
  {name:'@elastic/elasticsearch',description:'Included Elasticsearch client, search, indexing and response declarations.',group:'Included types'},
  {name:'mongodb',description:'Included MongoDB client, collection, query and BSON declarations.',group:'Included types'},
  {name:'svelte',description:'Included Svelte API, store and element declarations.',group:'Included types'},
  {name:'vue',description:'Included Vue API and component declarations.',group:'Included types'},
  {name:'@angular/core',description:'Included modern Angular core declarations.',group:'Included types'},
  {name:'fastify',description:'Included Fastify server and plugin declarations.',group:'Included types'},
  {name:'@nestjs/common',description:'Included NestJS common API declarations.',group:'Included types'},
  {name:'@hapi/hapi',description:'Included Hapi server declarations.',group:'Included types'},
  {name:'hono',description:'Included Hono application and routing declarations.',group:'Included types'},
  {name:'@adonisjs/core',description:'Included AdonisJS core declarations.',group:'Included types'},
] as const;
export function normalizeTypeLibraryChoices(value:unknown):TypeLibraryChoices{
  const choices:TypeLibraryChoices={};
  if(value&&typeof value==='object'&&!Array.isArray(value))for(const [id,enabled]of Object.entries(value)){
    if((typeLibraries.some(item=>item.id===id)||npmTypeName(id))&&typeof enabled==='boolean')choices[id]=enabled;
  }
  return choices;
}
