import json, tempfile, asyncio
import shutil
import os, sys
from logging import getLogger

sys.path.append(os.path.dirname(__file__))

from audio_utils import store_read as util_store_read, store_write as util_store_write, get_steam_path, get_pack_path, AUDIO_LOADER_VERSION, DECKY_HOME, DECKY_USER_HOME
from audio_remoteinstall import install

starter_config_data = {
  "selected_pack": "Default",
  "selected_music": "None",
  "sound_volume": 1,
  "music_volume": 0.5,
  "legacy_enabled": False
}
starter_config_string = json.dumps(starter_config_data)

logger = getLogger("AUDIO_LOADER")

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

class Result:
    def __init__(self, success : bool, message : str = "Success"):
        self.success = success
        self.message = message

        if not self.success:
            Log(f"Result failed! {message}")
    
    def raise_on_failure(self):
        if not self.success:
            raise Exception(self.message)

    def to_dict(self):
        return {"success": self.success, "message": self.message}

class Pack:
    def __init__(self, packPath : str, json : dict, truncatedPackPath: str):
        self.name = json["name"]
        self.description = json["description"] if ("description" in json) else ""
        self.version = json["version"] if ("version" in json) else "v1.0"
        self.author = json["author"] if ("author" in json) else "Unknown"
        self.require = int(json["manifest_version"]) if ("manifest_version" in json) else 1
        self.ignore = json["ignore"] if ("ignore" in json) else []
        self.mappings = json["mappings"] if ("mappings" in json) else {}
        self.music = bool(json["music"]) if ("music" in json) else False
        self.id = json["id"] if ("id" in json) else self.name
        

        if (AUDIO_LOADER_VERSION < self.require):
            raise Exception("Audio Loader - {} requires Audio Loader version {} but only version {} is installed".format(self.name, self.require, AUDIO_LOADER_VERSION))
        
        self.packPath = packPath
        self.truncatedPackPath = truncatedPackPath

        self.has_intro = False
        if (self.music == True):
            self.has_intro = "intro_music.mp3" in self.mappings or os.path.exists(os.path.join(packPath, "intro_music.mp3"))

    async def delete(self) -> Result:
        try:
            shutil.rmtree(self.packPath)
        except Exception as e:
            return Result(False, str(e))

        return Result(True)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "version": self.version,
            "author": self.author,
            "ignore": self.ignore,
            "mappings": self.mappings,
            "music": self.music,
            "hasIntro": self.has_intro,
            "packPath": self.packPath,
            "truncatedPackPath": self.truncatedPackPath,
            "id": self.id
        }

class Plugin:
    async def dummy_function(self) -> bool:
        return True

    async def get_loader_version(self) -> int:
        return AUDIO_LOADER_VERSION

    async def get_sound_packs(self) -> list:
        return [x.to_dict() for x in self.soundPacks]

    async def download_theme_from_url(self, id : str, url : str) -> dict:
        return (await install(id, url)).to_dict()

    async def get_config(self) -> object:
        configPath = os.path.join(get_pack_path(), 'config.json')

        Log("Audio Loader - Fetching config file at {}".format(configPath))
        if (os.path.exists(configPath)):
            Log("Audio Loader - Found config file")
            with open(configPath, "r") as fp:
                data = json.load(fp)
                self.config = data
                return data

    async def set_config(self, configObj: object):
        configPath = os.path.join(get_pack_path(), 'config.json')

        Log("Audio Loader - Setting config file at {}".format(configPath))
        if (os.path.exists(configPath)):
            Log("Audio Loader - Found config file")
            json_string = json.dumps(configObj)
            with open(configPath, "w") as fp:
                fp.write(json_string)
                return True

    # async def download_pack(self, uuid: str) -> dict:
    #     return (await self.remote.install(uuid)).to_dict()

    async def delete_pack(self, name: str) -> Result:
        pack = None

        for x in self.soundPacks:
            if x.name == name:
                pack = x
                break
        
        if (pack == None):
            return Result(False, f"Could not find {name}")
        
        result = await pack.delete()
        if not result.success:
            return result.to_dict()
        
        self.soundPacks.remove(pack)
        return Result(True).to_dict()

    async def parse_packs(self):
        packsDir = get_pack_path()
        self.soundPacks = []
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
                
                packData = Pack(packPath, pack, p)

                if (packData.name not in [p.name for p in self.soundPacks]):
                    self.soundPacks.append(packData)
                    Log("Audio Loader - Sound pack {} added".format(packData.name))
            except Exception as e:
                Log("Audio Loader - Error parsing sound pack: {}".format(e))

    async def store_read(self, key : str) -> str:
        return util_store_read(key)
    
    async def store_write(self, key : str, val : str) -> dict:
        util_store_write(key, val)
        return Result(True).to_dict()

    async def _load(self):
        packsPath = get_pack_path()
        
        configPath = os.path.join(get_pack_path(), 'config.json')

        Log("Audio Loader - Finding sound packs...")
        self.soundPacks = []

        if (not os.path.exists(packsPath)):
            await create_folder(packsPath)

        if (not os.path.exists(os.path.join(get_steam_path(), 'steamui', 'sounds_custom'))):
            await create_symlink(get_pack_path(), os.path.join(get_steam_path(), 'steamui', 'sounds_custom'))

        if (not os.path.exists(configPath)):
            await create_config(configPath)

        await self.parse_packs(self)
        await self.get_config(self)

        
        Log("Audio Loader - Config existing is {}".format(os.path.exists(configPath)))


    async def _main(self):
        self.soundPacks = []
        self.config = {
            "selected_pack": "Default", 
            "selected_music": "None",
            "sound_volume": 1,
            "music_volume": 0.5,
            "legacy_enabled": False
        }

        Log("Initializing Audio Loader...")
        await self._load(self)
        Log("Audio Loader initialized.")
        Log(str(self.soundPacks))
