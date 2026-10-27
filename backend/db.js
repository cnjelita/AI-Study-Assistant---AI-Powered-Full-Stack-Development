import {MongoClient} from 'mongodb';
let db;
export async function connectDB(){const client=new MongoClient(process.env.MONGO_URI);await client.connect();db=client.db('ai-study-assistant');await db.collection('users').createIndex({email:1},{unique:true});await db.collection('notes').createIndex({createdBy:1});await db.collection('noteChunks').createIndex({createdBy:1,noteId:1});return db;}
export function collections(){if(!db)throw Error('Database not connected');return {users:db.collection('users'),notes:db.collection('notes'),chunks:db.collection('noteChunks')};}
