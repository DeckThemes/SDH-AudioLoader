import asyncio, tempfile, os, zipfile, aiohttp
from audio_utils import Result, Log, get_pack_path, AUDIO_LOADER_VERSION

async def run(command : str) -> str:
    proc = await asyncio.create_subprocess_shell(command,        
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE)
    stdout, stderr = await proc.communicate()

    if (proc.returncode != 0):
        raise Exception(f"Process exited with error code {proc.returncode}")

    return stdout.decode()

async def install(id : str, base_url : str) -> Result:
    if not base_url.endswith("/"):
        base_url = base_url + "/"

    url = f"{base_url}themes/{id}"

    async with aiohttp.ClientSession(headers={"User-Agent": f"SDH-AudioLoader/{AUDIO_LOADER_VERSION}"}, connector=aiohttp.TCPConnector(verify_ssl=False)) as session:
        try:
            async with session.get(url) as resp:
                if resp.status != 200:
                    raise Exception(f"Invalid status code {resp.status}")

                data = await resp.json()
        except Exception as e:
            return Result(False, str(e))

        if (data["manifestVersion"] > AUDIO_LOADER_VERSION):
            raise Exception("Manifest version of themedb entry is unsupported by this version of AudioLoader")

        download_url = f"{base_url}blobs/{data['download']['id']}" 
        tempDir = tempfile.TemporaryDirectory()

        Log(f"Downloading {download_url} to {tempDir.name}...")
        themeZipPath = os.path.join(tempDir.name, 'pack.zip')
        try:
            async with session.get(download_url) as resp:
                if resp.status != 200:
                    raise Exception(f"Got {resp.status} code from '{download_url}'")

                with open(themeZipPath, "wb") as out:
                    out.write(await resp.read())

        except Exception as e:
            return Result(False, str(e))

    Log(f"Unzipping {themeZipPath}")
    try:
        with zipfile.ZipFile(themeZipPath, 'r') as zip:
            zip.extractall(get_pack_path())
    except Exception as e:
        return Result(False, str(e))

    tempDir.cleanup()

    return Result(True)