import os

def store_path() -> str:
    return os.path.join("/home/deck/homebrew/sounds", "STORE")

def store_reads() -> dict:
    path = store_path()
    items = {}

    if not os.path.exists(path):
        return items

    with open(path, 'r') as fp:
        for x in fp.readlines():
            if (x.strip() == ""):
                continue

            split = x.split(":", 1)

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
    items[key] = val
    with open(path, 'w') as fp:
        fp.writelines([f"{x}:{items[x]}" for x in items])
