import os
from logging import getLogger

logger = getLogger("AUDIO_LOADER")

def Log(text : str):
    logger.info(text)

async def createSymlink(src : str, dst : str):
    if os.path.exists(dst):
        print("Audio Loader - {} symlink already exists".format(dst))
        return
    os.symlink(src, dst, True)
    print("Audio Loader - Symlink created".format(dst))

async def createFolder(path):
    if os.path.exists(path):
        print("Audio Loader - {} folder already exists".format(path))
        return
    os.mkdir(path)
    print("Audio Loader - {} folder created".format(path))

class Plugin:
    async def _main(self):
        Log("Initializing Audio Loader...")
        await createFolder("/home/deck/homebrew/sounds")
        await createSymlink("/home/deck/homebrew/sounds", "/home/deck/.local/share/Steam/steamui/sounds_custom")
        Log("Audio Loader initialized.")
