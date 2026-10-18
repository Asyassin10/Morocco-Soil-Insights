"""Optional HTML comparison. Disabled until the operator establishes reuse rights."""
import html
import math
import re
import httpx

from ..core.config import ENABLE_FERTIMAP


def parse_values(text):
    fields = {}
    for tag in re.findall(r"<input\b[^>]*>", text, re.I):
        attrs = {k.lower(): html.unescape(v) for k, _, v in re.findall(r'([\w-]+)\s*=\s*([\"\x27])(.*?)\2', tag, re.S)}
        fields[attrs.get("id", "")] = attrs.get("value", "")
    values = {}
    for key in ("ph", "mo", "p", "k"):
        try:
            value = float(fields.get(key, "").replace(",", "."))
            values[key] = value if math.isfinite(value) else None
        except ValueError:
            values[key] = None
    if all(v in (None, 0) for v in values.values()) or values["ph"] == 0:
        return {k: None for k in values}
    return values


def fetch(field):
    if not ENABLE_FERTIMAP:
        return []
    lon,lat = field["center"]
    r = httpx.get("http://www.fertimap.ma/php/detail.inc.php", params={"x":lon,"y":lat}, timeout=18)
    r.raise_for_status()
    values = parse_values(r.text)
    mapping = {"ph":("ph","Soil pH","pH"), "mo":("organic_matter","Organic matter","%"),
               "p":("phosphorus_oxide","Phosphorus (P₂O₅)","mg/kg P₂O₅"), "k":("potassium_oxide","Potassium (K₂O)","mg/kg K₂O")}
    result = [{"property":v[0],"label":v[1],"unit":v[2],"value":values[k],"status":"ok" if values[k] is not None else "no_coverage",
             "source":"Fertimap","depth":"Not specified","method":"Editable fertility form estimate; provenance unverified",
             "estimated":True,"coverage_pct":0,"message":"Point comparison at field representative point; not a field raster."} for k,v in mapping.items()]
    labels = {}
    for label,text in re.findall(r"<th[^>]*>(.*?)</th>\s*<td[^>]*>(.*?)</td>",r.text,re.I|re.S):
        clean = lambda s: re.sub(r"\s+"," ",html.unescape(re.sub(r"<[^>]+>"," ",s))).strip()
        labels[clean(label)] = clean(text)
    for prop,label,upstream in [("soil_class","Moroccan soil type","Type de sol"),("texture_class","Texture class","Texture globale")]:
        text=labels.get(upstream,"")
        if "non encore" in text.lower():text=""
        result.append({"property":prop,"label":label,"unit":"class","value":None,"text_value":text or None,
                       "source":"Fertimap","depth":"Not specified","method":"Moroccan mapped soil classification; point comparison",
                       "status":"ok" if text else "no_coverage","estimated":True,"coverage_pct":0})
    return result
