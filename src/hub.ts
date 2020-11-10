import { CrossStorageHub, CrossStorageMethod } from 'cross-storage';

import JSONStorageItem from './JSONStorageItem';


interface SubDomainStr {
  origin: string,
  allow: CrossStorageMethod[],
}

const permissionsStorage = new JSONStorageItem<SubDomainStr[]>('crossStoragePermissions');
const permissions = permissionsStorage.get();

if (permissions) {
  const permissionsRegExp = permissions.map(p => ({...p, origin: new RegExp(p.origin)}));
  CrossStorageHub.init(permissionsRegExp);
}
