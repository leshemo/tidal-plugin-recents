import { LunaUnload, Tracer, ReactiveStore } from "@luna/core";
import { MediaItem, redux } from "@luna/lib";
import { settingsStore } from "./Settings";

export const { trace, errSignal } = Tracer("[SortByRecentlyPlayed]");
errSignal!._ = "SortByRecentlyPlayed plugin error signal";

// Plugin settings
export { Settings } from "./Settings";

// Functions in unloads are called when plugin is unloaded.
export const unloads = new Set<LunaUnload>();

// Constants
const RECENTLY_PLAYED_KEY = "recentlyPlayedOrder";

// Persistent storage for recently played album order
const persistentStore = await ReactiveStore.getPluginStorage("SortByRecentlyPlayed", { [RECENTLY_PLAYED_KEY]: [] }) as Record<string, any>;
let recentlyPlayedOrder: string[] = (persistentStore[RECENTLY_PLAYED_KEY] as string[]) || [];

// Track last played album and count of consecutive tracks
let lastAlbumId: string | null = null;
let consecutiveCount = 0;

// Guards to prevent conflicts
let isCurrentlySorting = false;
let isLoadingAllAlbums = false;

// Function to reload the current page to reflect sorting changes
function reloadCurrentPage() {
	try {
		const state = redux.store.getState();
		const currentPath = state.router?.currentPath;
		
		if (currentPath === '/my-collection/albums') {
			
			// Force a complete page refresh
			redux.actions["content/LOAD_FAVORITE_ALBUMS"]({
				albums: [],
				isModified: true
			});
			
			// Trigger a fresh load with reset
			setTimeout(() => {
				redux.actions["content/LOAD_LIST_ITEMS_PAGE"]({
					listName: 'favoriteAlbums',
					listType: 'album',
					order: 'DATE',
					orderDirection: 'DESC',
					reset: true
				});
			}, 50);
		}
	} catch (error) {
		trace.err(`Failed to reload page: ${error}`);
	}
}

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
	
	// Get the configurable track threshold from settings
	const trackThreshold = settingsStore.trackThreshold || 4;
	
	// Only update order if enough consecutive tracks from the same album are played
	if (consecutiveCount === trackThreshold) {
		// Check if this album is already at the top
		const wasAlreadyAtTop = recentlyPlayedOrder[0] === albumId;
		
		// Move albumId to top of recently played list
		recentlyPlayedOrder = [albumId, ...recentlyPlayedOrder.filter(id => id !== albumId)];
		
		// Apply storage limit
		const maxHistory = settingsStore.maxHistory || 300;
		recentlyPlayedOrder = recentlyPlayedOrder.slice(0, maxHistory);
		
		// Save to persistent storage
		persistentStore[RECENTLY_PLAYED_KEY] = recentlyPlayedOrder;
		
		// Only reload if the album wasn't already at the top and sorting is enabled
		if (!wasAlreadyAtTop && shouldSortByRecentlyPlayed()) {
			reloadCurrentPage();
		}
	}
});

// Function to check if sorting should be enabled
function shouldSortByRecentlyPlayed() {
	// Only sort if trackWithoutSort is false (i.e., sorting is enabled)
	return settingsStore.trackWithoutSort !== true;
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
		if (isLoadingAllAlbums) {
			return []; // Prevent multiple simultaneous loads
		}
		
		isLoadingAllAlbums = true;
		
		// Get the current state to see how many albums we have
		const state = redux.store.getState();
		const totalAlbums = state.favorites?.albums?.length || 0;
		
		if (totalAlbums === 0) {
			return [];
		}
		
		
		// Get all album IDs from the store
		const allAlbumIds = state.favorites?.albums || [];
		
		// Load all albums by dispatching a request for all of them
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
	} finally {
		isLoadingAllAlbums = false;
	}
}

// Redux interceptor that handles album list loading and sorting
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
		
		if (isFirstPage && hasMoreAlbums && !isLoadingAllAlbums) {
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
				
	} catch (error) {
		trace.err(`Failed to sort albums: ${error}`);
	} finally {
		isCurrentlySorting = false;
	}
});

// Log when plugin loads
trace.msg.log(`SortByRecentlyPlayed plugin loaded successfully. v0.1.28`);
