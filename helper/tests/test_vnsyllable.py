from vitranslate.vnsyllable import is_valid, suspicious

VALID = ["nguy\u1ec5n", "\u0111\u01b0\u1eddng", "tho\u00e1i", "khu\u1ef7u", "qu\u1ed1c", "gi\u1eefa",
         "nghi\u00eang", "\u01b0a", "h\u00f3a", "ng\u01b0\u1eddi", "chuy\u1ec3n", "m\u00f4", "b\u1ec7nh",
         "h\u1ecdc", "x\u01b0\u01a1ng", "tuy\u1ebfn", "gi\u00e1p", "h\u01b0\u1edbng", "khuy\u1ebft",
         "g\u00ec", "qu\u00fd", "nh\u1eefng", "\u0111\u01b0\u1ee3c", "\u0110\u01af\u1edcNG"]
INVALID = ["pulm\u00f4n", "th\u01b0\u1eddngg", "\u1eb9xtra", "tr\u1ebb\u1ebb"]


def test_valid_syllables():
    for word in VALID:
        assert is_valid(word), word


def test_invalid_syllables():
    for word in INVALID:
        assert not is_valid(word), word


def test_suspicious_ignores_ascii_and_dedupes():
    text = "BRAF VE1 v\u00e0 pulm\u00f4n, pulm\u00f4n; Thiroid cribiform"
    assert suspicious(text) == ["pulm\u00f4n"]
