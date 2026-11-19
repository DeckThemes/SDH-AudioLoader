import os
from logging import getLogger
import platform

Logger = getLogger("AUDIO_LOADER")
AUDIO_LOADER_VERSION = 3
HOME = os.getenv("HOME")
if not HOME:
    HOME = os.path.expanduser("~")
PLATFORM_WIN = platform.system() == "Windows"
DECKY_HOME = os.environ["DECKY_HOME"] # /home/user/homebrew
DECKY_USER_HOME = os.environ["DECKY_USER_HOME"] # /home/user
DECKY_USER = os.getenv("DECKY_USER")

AUDIO_EXTENSIONS = (".wav", ".mp3", ".m4a", ".aac", ".ogg", ".oga", ".opus", ".flac", ".webm", ".weba")

def Log(text : str):
    Logger.info(f"[AUDIO_LOADER] {text}")

def index_audio_files(pack_path : str) -> dict:
    index = {}
    try:
        names = os.listdir(pack_path)
    except OSError:
        return index

    for name in names:
        stem, ext = os.path.splitext(name)
        ext = ext.lower()
        if ext not in AUDIO_EXTENSIONS or not os.path.isfile(os.path.join(pack_path, name)):
            continue
        index.setdefault(stem, []).append(name)

    for stem in index:
        index[stem].sort(key=lambda n: (AUDIO_EXTENSIONS.index(os.path.splitext(n)[1].lower()), n))

    return index

def get_user_home() -> str:
    return HOME

def get_pack_path() -> str:
    return os.path.join(DECKY_HOME, "sounds")

def get_steam_path() -> str:
    if PLATFORM_WIN:
        try:
            import winreg
            conn = winreg.ConnectRegistry(None, winreg.HKEY_LOCAL_MACHINE)
            key = winreg.OpenKey(conn, "SOFTWARE\\Wow6432Node\\Valve\\Steam")
            val, type = winreg.QueryValueEx(key, "InstallPath")
            if type != winreg.REG_SZ:
                raise Exception(f"Expected type {winreg.REG_SZ}, got {type}")
            
            Log(f"Got win steam install path: '{val}'")
            return val
        except Exception as e:
            return "C:\\Program Files (x86)\\Steam" # Taking a guess here
    else:
        return f"{get_user_home()}/.local/share/Steam"

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

def store_path() -> str:
    return os.path.join(get_pack_path(), "STORE")

def store_reads() -> dict:
    path = store_path()
    items = {}

    if not os.path.exists(path):
        return items

    with open(path, 'r') as fp:
        for x in fp.readlines():
            c = x.strip()
            if (c == ""):
                continue

            split = c.split(":", 1)

            if (len(split) <= 1):
                continue

            items[split[0]] = split[1]
    
    return items

def store_read(key : str) -> str:
    items = store_reads()
    return items[key] if key in items else ""

def store_write(key : str, val : str):
    path = store_path()
    items = store_reads()
    items[key] = val.replace('\n', '')
    with open(path, 'w') as fp:
        fp.write("\n".join([f"{x}:{items[x]}" for x in items]))
