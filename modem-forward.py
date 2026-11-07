import asyncio,hashlib,json,sys,time
from pathlib import Path
root=Path(__file__).parent
remote_port=int(sys.argv[1])
async def forward(reader,writer):
    start=time.time(); records=[]
    other_reader,other_writer=await asyncio.open_connection("127.0.0.1",remote_port)
    async def copy(source,dest,direction):
        digest=hashlib.sha256();length=0;prefix=b""
        try:
            while data:=await source.read(65536):
                prefix=(prefix+data)[:24];length+=len(data);digest.update(data)
                dest.write(data);await dest.drain()
        finally:
            records.append(dict(direction=direction,bytes=length,sha256=digest.hexdigest(),prefix=prefix.decode(errors="replace")))
    tasks=[asyncio.create_task(copy(reader,other_writer,"sender_to_recipient")),asyncio.create_task(copy(other_reader,writer,"recipient_to_sender"))]
    await asyncio.wait(tasks,return_when=asyncio.FIRST_COMPLETED)
    for task in tasks:task.cancel()
    await asyncio.gather(*tasks,return_exceptions=True)
    writer.close();other_writer.close()
    with (root/"modem-forward.jsonl").open("a") as out:
        out.write(json.dumps(dict(start=start,source="127.0.0.1:6521",target=f"127.0.0.1:{remote_port}",directions=records))+"\n")
async def main():
    server=await asyncio.start_server(forward,"127.0.0.1",6521)
    print(f"READY127.0.0.1:6521 ->127.0.0.1:{remote_port}",flush=True)
    async with server:await server.serve_forever()
asyncio.run(main())
