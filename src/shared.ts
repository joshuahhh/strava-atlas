import { JSONStorageItem } from "./StorageItem";
import { StravaSummaryActivity, OAuthResponse } from "./stravaApi";

export const actDataStorage = new JSONStorageItem<StravaSummaryActivity[]>('actData');
export const tokenStorage = new JSONStorageItem<OAuthResponse>('token');
export const syncDateStorage = new JSONStorageItem<number>('syncDate');


import Stream from 'mithril/stream';

export function toggle<T>(t$: Stream<T | undefined>, t: T | undefined): void {
  t$(t$() == t ? undefined : t);
}