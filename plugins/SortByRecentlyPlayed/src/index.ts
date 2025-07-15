import { LunaUnload, Tracer, ReactiveStore } from "@luna/core";
import { MediaItem, redux } from "@luna/lib";
import { settingsStore } from "./Settings";

export const { trace, errSignal } = Tracer("[SortByRecentlyPlayed]");
errSignal!._ = "SortByRecentlyPlayed plugin error signal";

trace.msg.log(`Hello ${redux.store.getState().user.meta.profileName} from the SortByRecentlyPlayed plugin!`);

// Plugin settings
export { Settings } from "./Settings";

// Functions in unloads are called when plugin is unloaded.
export const unloads = new Set<LunaUnload>();

// Constants
const RECENTLY_PLAYED_KEY = "recentlyPlayedOrder";
const MAX_HISTORY = 300;

// Persistent storage for recently played album order
const persistentStore = await ReactiveStore.getPluginStorage("SortByRecentlyPlayed", { [RECENTLY_PLAYED_KEY]: [] }) as Record<string, any>;
let recentlyPlayedOrder: string[] = (persistentStore[RECENTLY_PLAYED_KEY] as string[]) || [];

// Track last played album and count of consecutive tracks
let lastAlbumId: string | null = null;
let consecutiveCount = 0;

// Listen for song changes to track recently played albums
MediaItem.onMediaTransition(unloads, async (mediaItem: any) => {
	const albumId = mediaItem.tidalItem?.album?.id?.toString();
	if (!albumId) return;
	
	// Track consecutive plays from the same album
	if (albumId === lastAlbumId) {
		consecutiveCount++;
	} else {
		consecutiveCount = 1;
		lastAlbumId = albumId;
	}
	
	// Only update order if at least two songs from the same album are played consecutively
	if (consecutiveCount === 2) {
		// Move albumId to top of recently played list
		recentlyPlayedOrder = [albumId, ...recentlyPlayedOrder.filter(id => id !== albumId)];
		
		// Limit history unless toggle is enabled
		if (!settingsStore.storeAllHistory) {
			recentlyPlayedOrder = recentlyPlayedOrder.slice(0, MAX_HISTORY);
		}
		
		// Save to persistent storage
		persistentStore[RECENTLY_PLAYED_KEY] = recentlyPlayedOrder;
		trace.msg.log(`Updated recently played order: ${recentlyPlayedOrder.slice(0, 5).join(', ')}...`);
	}
});

// Simple function to check if sorting should be enabled
function shouldSortByRecentlyPlayed() {
	return settingsStore.sortByRecentlyPlayed === true;
}

// Simple sorting function that uses the persistent order
function sortAlbumsByRecentlyPlayed(albums: any[]): any[] {
	if (!shouldSortByRecentlyPlayed() || recentlyPlayedOrder.length === 0) {
		return albums;
	}
	
	// Create a map for quick lookup of album positions
	const orderMap = new Map(recentlyPlayedOrder.map((id, idx) => [id, idx]));
	
	return [...albums].sort((a, b) => {
		const aIdx = orderMap.has(a.id.toString()) ? orderMap.get(a.id.toString())! : Infinity;
		const bIdx = orderMap.has(b.id.toString()) ? orderMap.get(b.id.toString())! : Infinity;
		return aIdx - bIdx; // Recently played albums (lower index) come first
	});
}

// Simple Redux interceptor that only handles the specific action we need
redux.intercept("content/LOAD_LIST_ITEMS_PAGE_SUCCESS_MODIFIED", unloads, (action: any) => {
	// Only process favorite albums
	if (action?.listName !== 'favoriteAlbums') {
		return;
	}
	
	// Only sort if enabled
	if (!shouldSortByRecentlyPlayed()) {
		return;
	}
	
	try {
		const items = action.items || [];
		if (items.length === 0) {
			return;
		}
		
		// Sort the items using our simple sorting function
		const sortedItems = sortAlbumsByRecentlyPlayed(items);
		
		// Update the action with sorted items
		action.items = sortedItems;
		action.isModified = true;
		
		trace.msg.log(`Sorted ${sortedItems.length} albums by recently played order`);
		
	} catch (error) {
		trace.err(`Failed to sort albums: ${error}`);
	}
});

// Log when plugin loads
trace.msg.log(`SortByRecentlyPlayed plugin loaded successfully. v0.1.17`);
