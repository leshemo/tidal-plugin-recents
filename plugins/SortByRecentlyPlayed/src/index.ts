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

// Guard to prevent double sorting
let isCurrentlySorting = false;

// Cache for album names to improve logging readability
const albumNameCache = new Map<string, string>();

// // Function to get album name for logging
// async function getAlbumName(albumId: string): Promise<string> {
// 	if (albumNameCache.has(albumId)) {
// 		return albumNameCache.get(albumId)!;
// 	}
	
// 	try {
// 		// Try to get album name from the current state
// 		const state = redux.store.getState();
// 		const albums = state.favorites?.albums || [];
		
// 		// Look for the album in the current favorites
// 		for (const album of albums) {
// 			if (album.id?.toString() === albumId) {
// 				const name = album.title || `Album ${albumId}`;
// 				albumNameCache.set(albumId, name);
// 				return name;
// 			}
// 		}
		
// 		// If not found, use a generic name
// 		const name = `Album ${albumId}`;
// 		albumNameCache.set(albumId, name);
// 		return name;
// 	} catch (error) {
// 		return `Album ${albumId}`;
// 	}
// }

// // Function to reload the current page to reflect sorting changes
// function reloadCurrentPage() {
// 	try {
// 		// Check if we're currently on the favorites albums page
// 		const state = redux.store.getState();
// 		const currentPath = state.router?.pathname;
		
// 		if (currentPath === '/my-collection/albums') {
// 			trace.msg.log("Reloading favorites albums page to reflect sorting changes...");
			
// 			// Dispatch a navigation action to reload the page
// 			redux.actions["router/NAVIGATED"]({
// 				params: {},
// 				path: '/my-collection/albums',
// 				search: ''
// 			});
			
// 			// Also trigger a fresh load of the albums
// 			setTimeout(() => {
// 				redux.actions["content/LOAD_LIST_ITEMS_PAGE"]({
// 					listName: 'favoriteAlbums',
// 					listType: 'album',
// 					order: 'DATE',
// 					orderDirection: 'DESC',
// 					reset: true
// 				});
// 			}, 100);
// 		}
// 	} catch (error) {
// 		trace.err(`Failed to reload page: ${error}`);
// 	}
// }

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
		// Check if this album is already at the top
		const wasAlreadyAtTop = recentlyPlayedOrder[0] === albumId;
		
		// Move albumId to top of recently played list
		recentlyPlayedOrder = [albumId, ...recentlyPlayedOrder.filter(id => id !== albumId)];
		
		// Limit history unless toggle is enabled
		if (!settingsStore.storeAllHistory) {
			recentlyPlayedOrder = recentlyPlayedOrder.slice(0, MAX_HISTORY);
		}
		
		// Save to persistent storage
		persistentStore[RECENTLY_PLAYED_KEY] = recentlyPlayedOrder;
		
		// Get album name for better logging
		// const albumName = await getAlbumName(albumId);
		// trace.msg.log(`Updated recently played order: ${albumName} (${albumId})`);
		
		// Only reload if the album wasn't already at the top and sorting is enabled
		// if (!wasAlreadyAtTop && shouldSortByRecentlyPlayed()) {
		// 	reloadCurrentPage();
		// }
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

// Function to force load all favorite albums
async function loadAllFavoriteAlbums(): Promise<any[]> {
	try {
		trace.msg.log("Loading all favorite albums for complete sorting...");
		
		// Get the current state to see how many albums we have
		const state = redux.store.getState();
		const totalAlbums = state.favorites?.albums?.length || 0;
		
		if (totalAlbums === 0) {
			trace.msg.log("No favorite albums found in store");
			return [];
		}
		
		trace.msg.log(`Found ${totalAlbums} total favorite albums`);
		
		// Get all album IDs from the store
		const allAlbumIds = state.favorites?.albums || [];
		
		// Load all albums by dispatching a request for all of them
		// This will trigger the Redux interceptor for each page
		redux.actions["content/LOAD_LIST_ITEMS_PAGE"]({
			listName: 'favoriteAlbums',
			listType: 'album',
			order: 'DATE',
			orderDirection: 'DESC',
			reset: true,
			limit: totalAlbums // Request all albums at once
		});
		
		return allAlbumIds;
	} catch (error) {
		trace.err(`Failed to load all favorite albums: ${error}`);
		return [];
	}
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
	
	// Guard against double sorting
	if (isCurrentlySorting) {
		return;
	}
	
	try {
		isCurrentlySorting = true;
		
		const items = action.items || [];
		if (items.length === 0) {
			return;
		}
		
		// Check if this is the first page and we should load all albums
		const isFirstPage = action.offset === 0;
		const hasMoreAlbums = action.totalNumberOfItems > items.length;
		
		if (isFirstPage && hasMoreAlbums) {
			// Load all albums to ensure complete sorting
			loadAllFavoriteAlbums();
		}
		
		// Sort the items using our simple sorting function
		const sortedItems = sortAlbumsByRecentlyPlayed(items);
		
		// Update the action with sorted items
		action.items = sortedItems;
		action.isModified = true;
		
		// Log album names for better readability
		const recentlyPlayedInPage = sortedItems
			.filter((album: any) => recentlyPlayedOrder.includes(album.id.toString()))
			.slice(0, 3)
			.map((album: any) => album.title || `Album ${album.id}`)
			.join(', ');
		
		trace.msg.log(`Sorted ${sortedItems.length} albums by recently played order. Recently played in this page: ${recentlyPlayedInPage || 'none'}`);
		
	} catch (error) {
		trace.err(`Failed to sort albums: ${error}`);
	} finally {
		isCurrentlySorting = false;
	}
});

// Log when plugin loads
trace.msg.log(`SortByRecentlyPlayed plugin loaded successfully. v0.1.20`);
