import json
import os
from logging import getLogger

starter_config_data = {
  "music_enabled": False,
  "music_library_only": False,
  "selected_pack": "Default" 
}
starter_config_string = json.dumps(starter_config_data)

logger = getLogger("AUDIO_LOADER")
AUDIO_LOADER_VERSION = 1

def Log(text : str):
    logger.info(text)

async def create_symlink(src : str, dst : str):
    if os.path.exists(dst):
        Log("Audio Loader - {} symlink already exists".format(dst))
        return
    os.symlink(src, dst, True)
    Log("Audio Loader - Symlink created".format(dst))

async def create_folder(path):
    if os.path.exists(path):
        Log("Audio Loader - {} folder already exists".format(path))
        return
    os.mkdir(path)
    Log("Audio Loader - {} folder created".format(path))

async def create_config(path):
    if os.path.exists(path):
        Log("Audio Loader - Config file already exists at {}".format(path))
        return
    with open(path, 'w') as fp:
        fp.write(starter_config_string)

class Pack:
    def __init__(self, packPath : str, json : dict):
        self.name = json["name"]
        self.description = json["description"] if ("description" in json) else ""
        self.version = json["version"] if ("version" in json) else "v1.0"
        self.author = json["author"] if ("author" in json) else "Unknown"
        self.require = int(json["manifest_version"]) if ("manifest_version" in json) else 1
        self.ignore = json["ignore"] if ("ignore" in json) else []
        self.music = bool(json["music"]) if ("music" in json) else False

        if (AUDIO_LOADER_VERSION < self.require):
            raise Exception("Audio Loader - {} requires Audio Loader version {} but only version {} is installed".format(self.name, self.require, AUDIO_LOADER_VERSION))
        
        self.packPath = packPath

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "version": self.version,
            "author": self.author,
            "ignore": self.ignore,
            "music": self.music,
            "packPath": self.packPath
        }

class Plugin:
    async def get_sound_packs(self) -> list:
        return [x.to_dict() for x in self.soundPacks]

    async def get_config(self) -> object:
        configPath = "/home/deck/homebrew/sounds/config.json"

        Log("Audio Loader - Fetching config file at {}".format(configPath))
        if (os.path.exists(configPath)):
            Log("Audio Loader - Found config file")
            with open(configPath, "r") as fp:
                data = json.load(fp)
                return data

    async def set_config(self, configObj: object):
        configPath = "/home/deck/homebrew/sounds/config.json"

        Log("Audio Loader - Setting config file at {}".format(configPath))
        if (os.path.exists(configPath)):
            Log("Audio Loader - Found config file")
            json_string = json.dumps(configObj)
            with open(configPath, "w") as fp:
                fp.write(json_string)
                return True

    async def _parse_packs(self, packsDir : str):
        possiblePacks = [str(p) for p in os.listdir(packsDir)]

        for p in possiblePacks:
            if not os.path.isdir(os.path.join(packsDir, p)):
                continue

            packPath = os.path.join(packsDir, p)
            packDataPath = os.path.join(packPath, "pack.json")

            if not os.path.exists(packDataPath):
                continue

            Log("Audio Loader - Analyzing sound pack {}".format(p))

            try:
                with open(packDataPath, "r") as f:
                    pack = json.load(f)
                
                packData = Pack(packPath, pack)

                if (packData.name not in [p.name for p in self.soundPacks]):
                    if (packData.music == False):
                        self.soundPacks.append(packData)
                        Log("Audio Loader - Sound pack {} added".format(packData.name))
            except Exception as e:
                Log("Audio Loader - Error parsing sound pack: {}".format(e))

    async def _load(self):
        packsPath = "/home/deck/homebrew/sounds"
        symlinkPath = "/home/deck/.local/share/Steam/steamui/sounds_custom"

        configPath = "/home/deck/homebrew/sounds/config.json"

        Log("Audio Loader - Finding sound packs...")
        self.soundPacks = []

        if (not os.path.exists(packsPath)):
            await create_folder(packsPath)

        if (not os.path.exists(symlinkPath)):
            await create_symlink(packsPath, symlinkPath)

        if (not os.path.exists(configPath)):
            await create_config(configPath)

        await self._parse_packs(self, packsPath)

        
        Log("Audio Loader - Path existing is {}".format(os.path.exists(configPath)))


    async def _main(self):
        self.soundPacks = []
        Log("Initializing Audio Loader...")
        await self._load(self)
        Log("Audio Loader initialized.")
        Log(str(self.soundPacks))
