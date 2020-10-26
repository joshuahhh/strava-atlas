import { JSONStorageItem } from "./StorageItem";
import { StravaSummaryActivity, OAuthResponse } from "./stravaApi";

export const actDataStorage = new JSONStorageItem<StravaSummaryActivity[]>('actData');
export const tokenStorage = new JSONStorageItem<OAuthResponse>('token');
export const syncDateStorage = new JSONStorageItem<number>('syncDate');