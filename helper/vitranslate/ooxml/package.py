"""Read an OOXML zip, parse parts lazily, write back with untouched entries byte-identical."""
import os
import tempfile
import zipfile
import zlib
from pathlib import Path

from lxml import etree

# No huge_tree: keeps libxml2's depth / size limits as a guard against hostile input.
_PARSER = etree.XMLParser(remove_blank_text=False, resolve_entities=False)


MAX_ENTRY_BYTES = 512 * 1024 * 1024
MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024


class UnsupportedFile(Exception):
    """The input is not a DOCX / PPTX package (or it is encrypted)."""


class OoxmlPackage:
    def __init__(self, path):
        self.path = Path(path)
        try:
            with zipfile.ZipFile(self.path) as z:
                self.infos = z.infolist()
                # declared sizes are checked before anything is inflated (zip bomb guard)
                if (any(i.file_size > MAX_ENTRY_BYTES for i in self.infos)
                        or sum(i.file_size for i in self.infos) > MAX_TOTAL_BYTES):
                    raise UnsupportedFile("file too large or a zip bomb")
                self.raw = {i.filename: z.read(i.filename) for i in self.infos}
        except (zipfile.BadZipFile, RuntimeError, NotImplementedError, zlib.error) as exc:
            raise UnsupportedFile("not an Office Open XML package (encrypted or damaged file?)") from exc
        if "word/document.xml" in self.raw:
            self.kind = "docx"
        elif "ppt/presentation.xml" in self.raw:
            self.kind = "pptx"
        else:
            raise UnsupportedFile("package is neither DOCX nor PPTX")
        self._roots = {}
        self.dirty = set()

    def names(self):
        return [i.filename for i in self.infos]

    def root(self, name):
        if name not in self._roots:
            self._roots[name] = etree.fromstring(self.raw[name], parser=_PARSER)
        return self._roots[name]

    def mark_dirty(self, name):
        if name not in self._roots:
            raise ValueError("part was never parsed with root(): %s" % name)
        self.dirty.add(name)

    def save(self, out_path):
        out_path = Path(out_path)
        fd, tmp = tempfile.mkstemp(dir=str(out_path.parent), suffix=".tmp")
        os.close(fd)
        try:
            with zipfile.ZipFile(tmp, "w") as z:
                for info in self.infos:
                    if info.filename in self.dirty:
                        data = etree.tostring(self._roots[info.filename].getroottree(),
                                              xml_declaration=True, encoding="UTF-8", standalone=True)
                    else:
                        data = self.raw[info.filename]
                    zi = zipfile.ZipInfo(info.filename, date_time=info.date_time)
                    zi.compress_type = info.compress_type
                    zi.external_attr = info.external_attr
                    z.writestr(zi, data)
            os.replace(tmp, out_path)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise
