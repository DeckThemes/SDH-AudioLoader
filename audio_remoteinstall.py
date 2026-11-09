import asyncio, tempfile, os, ssl, zipfile, aiohttp
from audio_utils import Result, Log, get_pack_path, AUDIO_LOADER_VERSION

async def run(command : str) -> str:
    proc = await asyncio.create_subprocess_shell(command,        
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE)
    stdout, stderr = await proc.communicate()

    if (proc.returncode != 0):
        raise Exception(f"Process exited with error code {proc.returncode}")

    return stdout.decode()

def make_ssl_context() -> ssl.SSLContext:
    # Normal certificate checking. Decky's own Python may not know the system certificates,
    # so point it at them when they exist.
    for cafile in ("/etc/ssl/certs/ca-certificates.crt", "/etc/ca-certificates/extracted/tls-ca-bundle.pem"):
        if os.path.isfile(cafile):
            return ssl.create_default_context(cafile=cafile)
    return ssl.create_default_context()

def safe_extract(zip_file: zipfile.ZipFile, target: str) -> None:
    # Unzips only files that stay inside the target folder (no "../" or absolute paths)
    base = os.path.realpath(target)
    for member in zip_file.infolist():
        dest = os.path.realpath(os.path.join(base, member.filename))
        if dest != base and not dest.startswith(base + os.sep):
            raise Exception(f"Unsafe path in the zip file: {member.filename}")
    zip_file.extractall(base)

async def install(id : str, base_url : str) -> Result:
    if not base_url.endswith("/"):
        base_url = base_url + "/"

    url = f"{base_url}themes/{id}"

    async with aiohttp.ClientSession(headers={"User-Agent": f"SDH-AudioLoader/{AUDIO_LOADER_VERSION}"}, connector=aiohttp.TCPConnector(ssl=make_ssl_context())) as session:
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
            safe_extract(zip, get_pack_path())
    except Exception as e:
        return Result(False, str(e))

    tempDir.cleanup()

    return Result(True)