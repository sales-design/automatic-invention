export interface InventoryItem {
  id: string
  reference: string
  description: string
  quantity: number
  location: string
  aisle: string
  column: number
  shelf: number
  created_at: string
  updated_at: string
}

export interface DatabaseResponse<T> {
  data: T | null
  error: string | null
}

class SteinAPIService {
  private apiUrl = "https://api.steinhq.com/v1/storages/68a87feeaffba40a62f0dad2"
  private possibleSheetNames = ["Sheet1", "Hoja1", "Hoja 1", "inventory", "Inventory", "almacén", "almacen"]
  private sheetName = "Sheet1" // Will be updated when we find the correct one
  private refreshInterval: NodeJS.Timeout | null = null
  private subscribers: ((items: InventoryItem[]) => void)[] = []
  private retryCount = 0
  private maxRetries = 3
  private lastRequestTime = 0
  private minRequestInterval = 1000 // 1 second between requests
  private fallbackMode = false
  private fallbackReason = ""
  private lastDataCache: InventoryItem[] = []

  private getLocalStorageKey(): string {
    return "warehouse-inventory-fallback"
  }

  private saveToLocalStorage(items: InventoryItem[]): void {
    if (typeof window !== "undefined") {
      localStorage.setItem(this.getLocalStorageKey(), JSON.stringify(items))
    }
  }

  private loadFromLocalStorage(): InventoryItem[] {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(this.getLocalStorageKey())
      if (stored) {
        try {
          return JSON.parse(stored)
        } catch (error) {
          console.error("Error parsing localStorage data:", error)
        }
      }
    }
    return []
  }

  private async makeRequest(endpoint = "", options: RequestInit = {}): Promise<any> {
    if (this.fallbackMode) {
      throw new Error(`API unavailable: ${this.fallbackReason}`)
    }

    try {
      const now = Date.now()
      const timeSinceLastRequest = now - this.lastRequestTime
      if (timeSinceLastRequest < this.minRequestInterval) {
        await new Promise((resolve) => setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest))
      }
      this.lastRequestTime = Date.now()

      const url = `${this.apiUrl}/${this.sheetName}${endpoint}`
      console.log(`[v0] SteinHQ API request: ${options.method || "GET"} ${url}`)

      const response = await fetch(url, {
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        ...options,
      })

      console.log(`[v0] SteinHQ API response: ${response.status} ${response.statusText}`)

      if (!response.ok) {
        const errorText = await response.text()
        console.log(`[v0] SteinHQ API error response: ${errorText}`)

        if (response.status === 402 || response.status === 429) {
          this.fallbackMode = true
          this.fallbackReason = "API limit exceeded - using local storage"
          console.warn("SteinHQ API limit exceeded, switching to localStorage fallback")
          throw new Error(`API limit exceeded`)
        }
        if (response.status === 500) {
          throw new Error(`Server error - please try again later`)
        }
        if (response.status === 400) {
          throw new Error(`Bad request - possibly incorrect sheet name "${this.sheetName}": ${errorText}`)
        }
        throw new Error(`HTTP error! status: ${response.status} - ${errorText}`)
      }

      const contentType = response.headers.get("content-type")
      if (contentType && contentType.includes("application/json")) {
        const text = await response.text()
        if (text.trim() === "") {
          return {}
        }
        return JSON.parse(text)
      } else {
        return {}
      }
    } catch (error) {
      console.error("SteinHQ API error:", error)

      if (error.message.includes("API limit") || error.message.includes("Payment required")) {
        this.fallbackMode = true
        this.fallbackReason = "API limit exceeded - using local storage"
      }

      if (
        this.retryCount < this.maxRetries &&
        (error.message.includes("Server error") ||
          error.message.includes("Failed to fetch") ||
          error.message.includes("JSON"))
      ) {
        this.retryCount++
        console.log(`Retrying request (${this.retryCount}/${this.maxRetries})...`)
        await new Promise((resolve) => setTimeout(resolve, 1000 * this.retryCount))
        return this.makeRequest(endpoint, options)
      }

      this.retryCount = 0
      throw error
    }
  }

  private generateId(): string {
    if (typeof window !== "undefined" && window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID()
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c == "x" ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }

  private mapSteinRowToItem(row: any): InventoryItem {
    return {
      id: row.id?.toString() || this.generateId(),
      reference: row.reference || "",
      description: row.description || "",
      quantity: Number.parseInt(row.quantity) || 0,
      location: row.location || "",
      aisle: row.aisle || "",
      column: Number.parseInt(row.column) || 0,
      shelf: Number.parseInt(row.shelf) || 0,
      created_at: row.created_at || new Date().toISOString(),
      updated_at: row.updated_at || new Date().toISOString(),
    }
  }

  private mapItemToSteinRow(item: InventoryItem): any {
    return {
      id: item.id,
      reference: item.reference,
      description: item.description,
      quantity: item.quantity,
      location: item.location,
      aisle: item.aisle,
      column: item.column,
      shelf: item.shelf,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }
  }

  private deepEqual(obj1: InventoryItem[], obj2: InventoryItem[]): boolean {
    if (obj1.length !== obj2.length) return false

    // Sort both arrays by id to ensure consistent comparison
    const sorted1 = [...obj1].sort((a, b) => a.id.localeCompare(b.id))
    const sorted2 = [...obj2].sort((a, b) => a.id.localeCompare(b.id))

    for (let i = 0; i < sorted1.length; i++) {
      const item1 = sorted1[i]
      const item2 = sorted2[i]

      // Compare all properties
      if (
        item1.id !== item2.id ||
        item1.reference !== item2.reference ||
        item1.description !== item2.description ||
        item1.quantity !== item2.quantity ||
        item1.location !== item2.location ||
        item1.aisle !== item2.aisle ||
        item1.column !== item2.column ||
        item1.shelf !== item2.shelf ||
        item1.created_at !== item2.created_at ||
        item1.updated_at !== item2.updated_at
      ) {
        return false
      }
    }

    return true
  }

  async insertItem(
    item: Omit<InventoryItem, "id" | "created_at" | "updated_at">,
  ): Promise<DatabaseResponse<InventoryItem>> {
    try {
      const newItem: InventoryItem = {
        ...item,
        id: this.generateId(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      if (this.fallbackMode) {
        const items = this.loadFromLocalStorage()
        items.push(newItem)
        this.saveToLocalStorage(items)
        this.lastDataCache = [...items]
        this.notifySubscribers()
        return { data: newItem, error: null }
      }

      const steinRow = this.mapItemToSteinRow(newItem)
      const response = await this.makeRequest("", {
        method: "POST",
        body: JSON.stringify([steinRow]),
      })

      const createdItem = Array.isArray(response) && response.length > 0 ? this.mapSteinRowToItem(response[0]) : newItem
      this.lastDataCache = []
      this.notifySubscribers()
      return { data: createdItem, error: null }
    } catch (error) {
      if (error.message.includes("API limit")) {
        const newItem: InventoryItem = {
          ...item,
          id: this.generateId(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        const items = this.loadFromLocalStorage()
        items.push(newItem)
        this.saveToLocalStorage(items)
        this.lastDataCache = [...items]
        this.notifySubscribers()
        return { data: newItem, error: null }
      }
      return { data: null, error: "Error inserting item" }
    }
  }

  async selectItems(): Promise<DatabaseResponse<InventoryItem[]>> {
    try {
      if (this.fallbackMode) {
        const items = this.loadFromLocalStorage()
        return { data: items, error: null }
      }

      if (this.sheetName === "Sheet1") {
        try {
          this.sheetName = await this.findCorrectSheetName()
        } catch (error) {
          console.warn("Could not find correct sheet name, falling back to localStorage:", error.message)
          this.fallbackMode = true
          this.fallbackReason = "Sheet not found - using local storage"
          const items = this.loadFromLocalStorage()
          return { data: items, error: null }
        }
      }

      const response = await this.makeRequest()
      const items = Array.isArray(response) ? response.map((row: any) => this.mapSteinRowToItem(row)) : []
      return { data: items, error: null }
    } catch (error) {
      if (error.message.includes("API limit") || error.message.includes("Bad request")) {
        console.warn("SteinHQ API error, switching to localStorage:", error.message)
        this.fallbackMode = true
        this.fallbackReason = error.message.includes("Bad request")
          ? "Sheet access error - using local storage"
          : "API limit exceeded - using local storage"
        const items = this.loadFromLocalStorage()
        return { data: items, error: null }
      }
      return { data: [], error: null }
    }
  }

  async updateItem(id: string, updates: Partial<InventoryItem>): Promise<DatabaseResponse<InventoryItem>> {
    try {
      if (this.fallbackMode) {
        const items = this.loadFromLocalStorage()
        const index = items.findIndex((item) => item.id === id)
        if (index === -1) {
          return { data: null, error: "Item not found" }
        }

        const updatedItem = {
          ...items[index],
          ...updates,
          updated_at: new Date().toISOString(),
        }
        items[index] = updatedItem
        this.saveToLocalStorage(items)
        this.lastDataCache = [...items]
        this.notifySubscribers()
        return { data: updatedItem, error: null }
      }

      const allItemsResponse = await this.selectItems()
      if (!allItemsResponse.data) {
        return { data: null, error: "Could not fetch items for update" }
      }

      const existingItem = allItemsResponse.data.find((item) => item.id === id)
      if (!existingItem) {
        return { data: null, error: "Item not found" }
      }

      const updatedItem = {
        ...existingItem,
        ...updates,
        updated_at: new Date().toISOString(),
      }

      const response = await this.makeRequest("", {
        method: "PUT",
        body: JSON.stringify({
          condition: { id: id },
          set: this.mapItemToSteinRow(updatedItem),
        }),
      })

      this.lastDataCache = []
      this.notifySubscribers()
      return { data: updatedItem, error: null }
    } catch (error) {
      if (error.message.includes("API limit")) {
        const items = this.loadFromLocalStorage()
        const index = items.findIndex((item) => item.id === id)
        if (index === -1) {
          return { data: null, error: "Item not found" }
        }

        const updatedItem = {
          ...items[index],
          ...updates,
          updated_at: new Date().toISOString(),
        }
        items[index] = updatedItem
        this.saveToLocalStorage(items)
        this.lastDataCache = [...items]
        this.notifySubscribers()
        return { data: updatedItem, error: null }
      }
      return { data: null, error: "Error updating item" }
    }
  }

  async deleteItem(id: string): Promise<DatabaseResponse<boolean>> {
    try {
      if (this.fallbackMode) {
        const items = this.loadFromLocalStorage()
        const index = items.findIndex((item) => item.id === id)
        if (index === -1) {
          return { data: false, error: "Item not found" }
        }

        items.splice(index, 1)
        this.saveToLocalStorage(items)
        this.lastDataCache = [...items]
        this.notifySubscribers()
        return { data: true, error: null }
      }

      await this.makeRequest("", {
        method: "DELETE",
        body: JSON.stringify({
          condition: { id: id },
        }),
      })

      this.lastDataCache = []
      this.notifySubscribers()
      return { data: true, error: null }
    } catch (error) {
      if (error.message.includes("API limit")) {
        const items = this.loadFromLocalStorage()
        const index = items.findIndex((item) => item.id === id)
        if (index === -1) {
          return { data: false, error: "Item not found" }
        }

        items.splice(index, 1)
        this.saveToLocalStorage(items)
        this.lastDataCache = [...items]
        this.notifySubscribers()
        return { data: true, error: null }
      }
      return { data: false, error: "Error deleting item" }
    }
  }

  async selectItemsByLocation(aisle: string): Promise<DatabaseResponse<InventoryItem[]>> {
    try {
      const itemsResult = await this.selectItems()
      if (itemsResult.error || !itemsResult.data) {
        return { data: null, error: "Error fetching items by location" }
      }

      const filteredItems = itemsResult.data.filter((item) => item.aisle === aisle)
      return { data: filteredItems, error: null }
    } catch (error) {
      return { data: null, error: "Error filtering items by location" }
    }
  }

  private async notifySubscribers(): Promise<void> {
    const result = await this.selectItems()
    if (result.data) {
      if (!this.deepEqual(this.lastDataCache, result.data)) {
        console.log("[v0] Data changes detected, updating subscribers")
        this.lastDataCache = [...result.data] // Update cache
        this.subscribers.forEach((callback) => callback(result.data!))
      } else {
        console.log("[v0] No data changes detected, skipping update")
      }
    }
  }

  async subscribeToChanges(callback: (items: InventoryItem[]) => void): Promise<() => void> {
    this.subscribers.push(callback)

    const result = await this.selectItems()
    if (result.data) {
      this.lastDataCache = [...result.data]
      callback(result.data)
    }

    if (!this.refreshInterval) {
      this.refreshInterval = setInterval(async () => {
        try {
          if (!this.fallbackMode) {
            await this.notifySubscribers()
          }
        } catch (error) {
          console.error("Error during auto-refresh:", error)
        }
      }, 5000)
    }

    return () => {
      const index = this.subscribers.indexOf(callback)
      if (index > -1) {
        this.subscribers.splice(index, 1)
      }

      if (this.subscribers.length === 0 && this.refreshInterval) {
        clearInterval(this.refreshInterval)
        this.refreshInterval = null
        this.lastDataCache = []
      }
    }
  }

  isFallbackMode(): boolean {
    return this.fallbackMode
  }

  getFallbackReason(): string {
    return this.fallbackReason
  }

  private async findCorrectSheetName(): Promise<string> {
    for (const sheetName of this.possibleSheetNames) {
      try {
        console.log(`[v0] Trying sheet name: ${sheetName}`)
        const url = `${this.apiUrl}/${sheetName}`
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        })

        if (response.ok) {
          console.log(`[v0] Found correct sheet name: ${sheetName}`)
          return sheetName
        }
      } catch (error) {
        console.log(`[v0] Sheet name ${sheetName} failed:`, error.message)
        continue
      }
    }
    throw new Error("Could not find a valid sheet name. Please check your Google Sheet.")
  }

  async initializeSheet(): Promise<void> {
    try {
      this.sheetName = await this.findCorrectSheetName()
      console.log(`SteinHQ API service initialized with sheet: ${this.sheetName}`)
    } catch (error) {
      console.warn("Could not initialize SteinHQ API, will use localStorage fallback:", error.message)
      this.fallbackMode = true
      this.fallbackReason = "Sheet initialization failed - using local storage"
    }
  }
}

export const db = new SteinAPIService()

export const createTables = async () => {
  await db.initializeSheet()
  console.log("SteinHQ API service initialized")
}
