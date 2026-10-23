import http from 'node:http';
const server=http.createServer(async(req,res)=>{
 for await(const _ of req){}
 console.log(JSON.stringify({timestamp:new Date().toISOString(),method:req.method,path:req.url}));
 res.setHeader('Content-Type','application/json');
 if(req.url==='/v1/models')res.end(JSON.stringify({object:'list',data:Array.from({length:732},(_,i)=>({id:`proof-${i}`,object:'model',owned_by:'local-fixture'}))}));
 else {res.writeHead(404);res.end(JSON.stringify({error:{message:'Catalog-only fixture; inference not implemented'}}));}
});
server.listen(19991,'127.0.0.1',()=>console.log('Local reported-release catalog fixture19991'));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
