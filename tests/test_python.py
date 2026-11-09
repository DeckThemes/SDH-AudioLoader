"""Tests for the Python side: zip validation (pack installer) and saving settings (set_config).
Run with:  python3 tests/test_python.py"""
import asyncio, importlib.util, json, os, ssl, sys, tempfile, types, unittest, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# On the Deck, Decky provides these. Here, stand-ins are enough (nothing is downloaded).
sys.modules.setdefault("aiohttp", types.ModuleType("aiohttp"))
HOME = tempfile.mkdtemp(prefix="audioloader_test_")
for name in ("DECKY_HOME", "DECKY_USER_HOME", "DECKY_PLUGIN_LOG_DIR", "DECKY_PLUGIN_SETTINGS_DIR"):
    os.environ.setdefault(name, HOME)
os.makedirs(os.path.join(os.environ["DECKY_HOME"], "sounds"), exist_ok=True)
sys.path.insert(0, ROOT)


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


installer = load("audio_remoteinstall", "audio_remoteinstall.py")
main = load("al_main", "main.py")


def make_zip(names):
    path = os.path.join(tempfile.mkdtemp(), "pack.zip")
    with zipfile.ZipFile(path, "w") as f:
        for n in names:
            f.writestr(n, "x")
    return path


class ZipValidation(unittest.TestCase):
    def test_normal_pack_is_unzipped(self):
        target = tempfile.mkdtemp()
        with zipfile.ZipFile(make_zip(["Pack/pack.json", "Pack/music/a.mp3"])) as f:
            installer.safe_extract(f, target)
        self.assertTrue(os.path.isfile(os.path.join(target, "Pack", "music", "a.mp3")))

    def test_unsafe_paths_are_refused_and_nothing_is_written(self):
        for bad in ("../evil.txt", "Pack/../../evil.txt", "/tmp/evil_abs.txt"):
            with self.subTest(path=bad):
                outer = tempfile.mkdtemp()
                target = os.path.join(outer, "packs")
                os.makedirs(target)
                with zipfile.ZipFile(make_zip(["Pack/ok.txt", bad])) as f:
                    with self.assertRaises(Exception) as ctx:
                        installer.safe_extract(f, target)
                self.assertIn("Unsafe path", str(ctx.exception))
                self.assertEqual(os.listdir(target), [])
                self.assertFalse(os.path.exists(os.path.join(outer, "evil.txt")))

    def test_downloads_check_certificates(self):
        ctx = installer.make_ssl_context()
        self.assertEqual(ctx.verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(ctx.check_hostname)


class SettingsMerging(unittest.TestCase):
    def setUp(self):
        self.cfg_path = os.path.join(os.environ["DECKY_HOME"], "sounds", "config.json")
        self.plugin = main.Plugin
        self.run_async = lambda coro: asyncio.run(coro)

    def read(self):
        with open(self.cfg_path) as f:
            return json.load(f)

    def test_saving_the_usual_settings_keeps_the_other_ones(self):
        with open(self.cfg_path, "w") as f:
            json.dump({**main.starter_config_data, "daily_random_music": True,
                       "daily_music_date": "2026-11-07", "daily_music_pick": "Chill", "variety_level": 70}, f)
        usual = {"selected_pack": "Default", "selected_music": "Chill", "sound_volume": 0.8,
                 "music_volume": 0.3, "legacy_enabled": True}
        self.assertTrue(self.run_async(self.plugin.set_config(self.plugin, usual)))
        c = self.read()
        self.assertTrue(c["daily_random_music"])
        self.assertEqual(c["daily_music_pick"], "Chill")
        self.assertEqual(c["variety_level"], 70)
        self.assertEqual(c["sound_volume"], 0.8)

    def test_a_partial_update_changes_only_what_it_sends(self):
        with open(self.cfg_path, "w") as f:
            json.dump({**main.starter_config_data, "music_volume": 0.3, "selected_pack": "Default"}, f)
        self.assertTrue(self.run_async(self.plugin.set_config(self.plugin, {"daily_music_pick": "Jazz"})))
        c = self.read()
        self.assertEqual(c["daily_music_pick"], "Jazz")
        self.assertEqual(c["music_volume"], 0.3)
        self.assertEqual(c["selected_pack"], "Default")

    def test_an_old_config_file_is_upgraded(self):
        with open(self.cfg_path, "w") as f:
            json.dump({"selected_pack": "Default", "music_volume": 0.4}, f)
        self.assertTrue(self.run_async(self.plugin.set_config(self.plugin, {"smooth_fades": True})))
        c = self.read()
        self.assertTrue(c["smooth_fades"])
        self.assertEqual(c["music_volume"], 0.4)


if __name__ == "__main__":
    unittest.main(verbosity=2)
