from vitranslate.tm import TM


def test_tm_roundtrip(tmp_path):
    tm = TM(tmp_path / "tm.sqlite")
    k = TM.key("qwen3.5:9b", "pathology@0.1.0", "In <g1>x</g1>")
    assert tm.get(k) is None
    tm.put(k, "Trong <g1>x</g1>", 1)
    assert tm.get(k) == ("Trong <g1>x</g1>", 1)
    assert TM.key("qwen3.5:4b", "pathology@0.1.0", "In <g1>x</g1>") != k
    tm.close()


def test_tm_never_stores_empty_and_sets_pragmas(tmp_path):
    tm = TM(tmp_path / "tm.sqlite")
    k = TM.key("m", "p", "x")
    tm.put(k, "", 1)
    tm.put(k, "   ", 1)
    assert tm.get(k) is None
    assert TM.key("a", "bc", "d") != TM.key("ab", "c", "d")
    assert tm._db.execute("PRAGMA user_version").fetchone()[0] == 1
    assert tm._db.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"
    tm.close()
