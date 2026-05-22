import type { Address } from '@/types';

export interface RegionInfo {
  province: string;
  city: string;
  district: string;
}

const PROVINCE_RE = /^(北京|天津|上海|重庆|河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海|台湾|内蒙古|广西|西藏|宁夏|新疆|香港|澳门)(省|市|自治区|特别行政区|壮族自治区|回族自治区|维吾尔自治区)?/;
const CITY_RE = /(?:省|市|自治区|特别行政区|壮族自治区|回族自治区|维吾尔自治区)(.{2,8}?)(市|地区|盟|自治州|州)/;
const DISTRICT_RE = /(市|地区|盟|自治州|州)(.{2,6}?)(区|县|市|旗)/;

export function parseRegion(address: string): RegionInfo | null {
  if (!address) return null;

  let province = '';
  let city = '';
  let district = '';

  const pm = address.match(PROVINCE_RE);
  if (pm) {
    province = pm[1];
    const afterProvince = address.slice(pm[0].length);

    const directCities = ['北京', '天津', '上海', '重庆'];
    if (directCities.includes(province)) {
      city = province;
      const dm = afterProvince.match(/^(.{2,6}?)(区|县)/);
      if (dm) district = dm[1] + dm[2];
    } else {
      const cm = afterProvince.match(/^(.{2,8}?)(市|地区|盟|自治州|州)/);
      if (cm) {
        city = cm[1] + cm[2];
        const afterCity = afterProvince.slice(cm[0].length);
        const dm = afterCity.match(/^(.{2,6}?)(区|县|市|旗)/);
        if (dm) district = dm[1] + dm[2];
      }
    }
  } else {
    const cm = address.match(CITY_RE);
    if (cm) city = cm[1] + cm[2];
    const dm = address.match(DISTRICT_RE);
    if (dm) district = dm[2] + dm[3];
  }

  if (!province && !city) return null;
  return { province, city, district };
}

export interface RegionStat {
  name: string;
  count: number;
}

export function aggregateByProvince(addresses: Address[]): RegionStat[] {
  const map = new Map<string, number>();
  for (const a of addresses) {
    const r = parseRegion(a.address);
    if (!r || !r.province) continue;
    map.set(r.province, (map.get(r.province) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}
