"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Search, Package, Edit2, Plus, Minus, MapPin, AlertCircle, Map } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { db, type InventoryItem } from "@/lib/database"

interface Reference {
  id: string
  name: string
  quantity: number
}

interface Box {
  id: string
  level: number
  name: string
  references: Reference[]
}

interface Column {
  id: string
  name: string
  boxes: Box[]
}

interface Aisle {
  id: string
  name: string
  columns: Column[]
}

interface SearchResult {
  reference: string
  totalUnits: number
  locations: {
    aisle: string
    column: string
    level: number
    quantity: number
    accessibility: number
    priority: number
    proximity: number
    totalScore: number
    referenceName: string
    referenceId: string
  }[]
}

export default function WarehouseManagement() {
  const [aisles, setAisles] = useState<Aisle[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<{ aisle: string; column: string; level: number } | null>(
    null,
  )
  const [editingName, setEditingName] = useState<{ type: "aisle" | "column"; id: string } | null>(null)
  const [newName, setNewName] = useState("")
  const [showMap, setShowMap] = useState(false)
  const [highlightedBoxes, setHighlightedBoxes] = useState<
    { aisleId: string; columnId: string; level: number; accessibility?: number }[]
  >([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showSearchDialog, setShowSearchDialog] = useState(false)

  const saveToDatabase = async (data: Aisle[]) => {
    try {
      // Convert aisle structure to inventory items for database storage
      const inventoryItems: Omit<InventoryItem, "id" | "created_at" | "updated_at">[] = []

      data.forEach((aisle) => {
        aisle.columns.forEach((column) => {
          column.boxes.forEach((box) => {
            box.references.forEach((ref) => {
              inventoryItems.push({
                reference: ref.id,
                description: ref.name,
                quantity: ref.quantity,
                location: `${aisle.name}-${column.name}-${box.name}`,
                aisle: aisle.id,
                column: Number.parseInt(column.id.split("C")[1]),
                shelf: box.level,
              })
            })
          })
        })
      })

      // Clear existing items and insert new ones
      const existingItems = await db.selectItems()
      if (existingItems.data) {
        for (const item of existingItems.data) {
          await db.deleteItem(item.id)
        }
      }

      // Insert new items
      for (const item of inventoryItems) {
        await db.insertItem(item)
      }

      if (db.isFallbackMode()) {
        console.log("[v0] Inventory saved to localStorage (API fallback mode)")
      } else {
        console.log("[v0] Inventory saved to database")
      }
    } catch (error) {
      console.error("[v0] Error saving to database:", error)
      setError("Error saving to database")
    }
  }

  const loadFromDatabase = async (): Promise<Aisle[]> => {
    try {
      const result = await db.selectItems()
      if (result.error || !result.data) {
        console.error("[v0] Database error:", result.error)
        return []
      }

      // Convert database items back to aisle structure
      const aisleMap: { [key: string]: Aisle } = {}

      result.data.forEach((item) => {
        if (!aisleMap[item.aisle]) {
          aisleMap[item.aisle] = {
            id: item.aisle,
            name: `Pasillo ${item.aisle}`,
            columns: Array.from({ length: 7 }, (_, colIndex) => ({
              id: `${item.aisle}-C${colIndex + 1}`,
              name: `Columna ${colIndex + 1}`,
              boxes: Array.from({ length: 6 }, (_, levelIndex) => ({
                id: `${item.aisle}-C${colIndex + 1}-L${levelIndex + 1}`,
                level: levelIndex + 1,
                name: `Nivel ${levelIndex + 1}`,
                references: [],
              })),
            })),
          }
        }

        const aisle = aisleMap[item.aisle]
        const column = aisle.columns.find((c) => c.id === `${item.aisle}-C${item.column}`)
        if (column) {
          const box = column.boxes.find((b) => b.level === item.shelf)
          if (box) {
            box.references.push({
              id: item.reference,
              name: item.description,
              quantity: item.quantity,
            })
          }
        }
      })

      if (db.isFallbackMode()) {
        console.log("[v0] Inventory loaded from localStorage (API fallback mode)")
      } else {
        console.log("[v0] Inventory loaded from database")
      }
      return Object.values(aisleMap).sort((a, b) => a.id.localeCompare(b.id))
    } catch (error) {
      console.error("[v0] Error loading from database:", error)
      return null
    }
  }

  const createInitialData = (): Aisle[] => {
    const aisleLetters = ["A", "B", "C", "D", "E", "F", "G", "H", "I"]
    const initialData: Aisle[] = aisleLetters.map((letter) => ({
      id: letter,
      name: `Pasillo ${letter}`,
      columns: Array.from({ length: 7 }, (_, colIndex) => ({
        id: `${letter}-C${colIndex + 1}`,
        name: `Columna ${colIndex + 1}`,
        boxes: Array.from({ length: 6 }, (_, levelIndex) => ({
          id: `${letter}-C${colIndex + 1}-L${levelIndex + 1}`,
          level: levelIndex + 1,
          name: `Nivel ${levelIndex + 1}`,
          references: [],
        })),
      })),
    }))

    // Añadir algunos datos de ejemplo solo si no hay datos guardados
    initialData[0].columns[0].boxes[0].references = [
      { id: "REF001", name: "Arnés Deportivo", quantity: 25 },
      { id: "REF002", name: "Collar Ajustable", quantity: 45 },
    ]
    initialData[0].columns[0].boxes[1].references = [{ id: "REF001", name: "Arnés Deportivo", quantity: 120 }]
    initialData[0].columns[1].boxes[0].references = [{ id: "REF003", name: "Correa Extensible", quantity: 15 }]
    initialData[1].columns[0].boxes[0].references = [{ id: "REF002", name: "Collar Ajustable", quantity: 80 }]
    initialData[2].columns[2].boxes[2].references = [{ id: "REF004", name: "Cama Ortopédica", quantity: 5 }]

    return initialData
  }

  useEffect(() => {
    const initializeData = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const savedData = await loadFromDatabase()
        if (savedData) {
          setAisles(savedData)
        } else {
          const initialData = createInitialData()
          setAisles(initialData)
          await saveToDatabase(initialData)
        }
      } catch (err) {
        console.error("[v0] Error initializing data:", err)
        setError("Error loading data from database")
        // Fallback to initial data
        const initialData = createInitialData()
        setAisles(initialData)
      } finally {
        setIsLoading(false)
      }
    }

    initializeData()
  }, [])

  useEffect(() => {
    if (aisles.length > 0 && !isLoading) {
      const saveData = async () => {
        try {
          await saveToDatabase(aisles)
        } catch (err) {
          console.error("[v0] Error auto-saving:", err)
          setError("Error saving changes")
        }
      }

      // Debounce saves to avoid too frequent database calls
      const timeoutId = setTimeout(saveData, 1000)
      return () => clearTimeout(timeoutId)
    }
  }, [aisles, isLoading])

  useEffect(() => {
    let unsubscribe: (() => void) | null = null

    const setupRealtimeUpdates = async () => {
      try {
        unsubscribe = await db.subscribeToChanges(async (items) => {
          // Convert database items back to aisle structure
          const aisleMap: { [key: string]: Aisle } = {}

          // Initialize empty structure
          const aisleLetters = ["A", "B", "C", "D", "E", "F", "G", "H", "I"]
          aisleLetters.forEach((letter) => {
            aisleMap[letter] = {
              id: letter,
              name: `Pasillo ${letter}`,
              columns: Array.from({ length: 7 }, (_, colIndex) => ({
                id: `${letter}-C${colIndex + 1}`,
                name: `Columna ${colIndex + 1}`,
                boxes: Array.from({ length: 6 }, (_, levelIndex) => ({
                  id: `${letter}-C${colIndex + 1}-L${levelIndex + 1}`,
                  level: levelIndex + 1,
                  name: `Nivel ${levelIndex + 1}`,
                  references: [],
                })),
              })),
            }
          })

          // Populate with database items
          items.forEach((item) => {
            const aisle = aisleMap[item.aisle]
            if (aisle) {
              const column = aisle.columns.find((c) => c.id === `${item.aisle}-C${item.column}`)
              if (column) {
                const box = column.boxes.find((b) => b.level === item.shelf)
                if (box) {
                  box.references.push({
                    id: item.reference,
                    name: item.description,
                    quantity: item.quantity,
                  })
                }
              }
            }
          })

          const updatedAisles = Object.values(aisleMap).sort((a, b) => a.id.localeCompare(b.id))
          setAisles(updatedAisles)
          console.log("[v0] Real-time update received from database")
        })
      } catch (err) {
        console.error("[v0] Error setting up real-time updates:", err)
      }
    }

    if (!isLoading) {
      setupRealtimeUpdates()
    }

    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [isLoading])

  const calculateAccessibility = (aisle: Aisle, columnId: string, targetLevel: number): number => {
    const column = aisle.columns.find((col) => col.id === columnId)
    if (!column) return 3 // Default to high accessibility for empty spaces

    const boxesAbove = column.boxes.filter((box) => box.level > targetLevel && box.references.length > 0).length
    const boxesBelow = column.boxes.filter((box) => box.level < targetLevel && box.references.length > 0).length

    // Empty spaces are highly accessible (green)
    const targetBox = column.boxes.find((box) => box.level === targetLevel)
    if (!targetBox || targetBox.references.length === 0) return 3

    // Calculate accessibility based on obstacles above and proximity to ground
    if (boxesAbove === 0 && targetLevel <= 2) return 3 // Very accessible
    if (boxesAbove <= 1 && targetLevel <= 4) return 2 // Moderately accessible
    return 1 // Low accessibility
  }

  const calculateProximity = (aisleId: string): number => {
    const aisleIndex = aisleId.charCodeAt(0) - "A".charCodeAt(0)
    return 9 - aisleIndex
  }

  const searchReference = (term: string) => {
    if (!term.trim()) {
      setSearchResults(null)
      setHighlightedBoxes([])
      return
    }

    const locations: SearchResult["locations"] = []
    let totalUnits = 0

    aisles.forEach((aisle) => {
      aisle.columns.forEach((column) => {
        column.boxes.forEach((box) => {
          const reference = box.references.find(
            (ref) =>
              ref.id.toLowerCase().includes(term.toLowerCase()) || ref.name.toLowerCase().includes(term.toLowerCase()),
          )

          if (reference) {
            totalUnits += reference.quantity

            const priority = reference.quantity <= 50 ? 3 : reference.quantity <= 100 ? 2 : 1
            const accessibility = calculateAccessibility(aisle, column.id, box.level)
            const proximity = calculateProximity(aisle.id)

            const priorityScore = (priority / 3) * 5
            const accessibilityScore = (accessibility / 3) * 5
            const proximityScore = (proximity / 9) * 5

            const totalScore = priorityScore * 0.4 + accessibilityScore * 0.35 + proximityScore * 0.25

            locations.push({
              aisle: aisle.name,
              column: column.name,
              level: box.level,
              quantity: reference.quantity,
              accessibility,
              priority,
              proximity,
              totalScore,
              referenceName: reference.name,
              referenceId: reference.id,
            })
          }
        })
      })
    })

    locations.sort((a, b) => b.totalScore - a.totalScore)

    setSearchResults({
      reference: term,
      locations,
      totalUnits,
    })

    const boxesToHighlight: { aisleId: string; columnId: string; level: number; accessibility: number }[] = []
    aisles.forEach((aisle) => {
      aisle.columns.forEach((column) => {
        column.boxes.forEach((box) => {
          const reference = box.references.find(
            (ref) =>
              ref.id.toLowerCase().includes(term.toLowerCase()) || ref.name.toLowerCase().includes(term.toLowerCase()),
          )
          if (reference) {
            const accessibility = calculateAccessibility(aisle, column.id, box.level)
            boxesToHighlight.push({
              aisleId: aisle.id,
              columnId: column.id,
              level: box.level,
              accessibility,
            })
          }
        })
      })
    })
    setHighlightedBoxes(boxesToHighlight)
  }

  const updateName = (type: "aisle" | "column", id: string, newName: string) => {
    if (!newName.trim()) return

    setAisles((prev) =>
      prev.map((aisle) => {
        if (type === "aisle" && aisle.id === id) {
          return { ...aisle, name: newName.trim() }
        }
        if (type === "column") {
          return {
            ...aisle,
            columns: aisle.columns.map((column) => (column.id === id ? { ...column, name: newName.trim() } : column)),
          }
        }
        return aisle
      }),
    )
    setEditingName(null)
    setNewName("")
  }

  const addReference = async (
    aisleId: string,
    columnId: string,
    level: number,
    refData: { id: string; name: string; quantity: number },
  ) => {
    if (!refData.id.trim() || !refData.name.trim() || refData.quantity <= 0) {
      console.log("[v0] Invalid reference data, not adding")
      return
    }

    try {
      const columnNumber = Number.parseInt(columnId.split("C")[1])
      const result = await db.insertItem({
        reference: refData.id,
        description: refData.name,
        quantity: refData.quantity,
        location: `Pasillo ${aisleId}-Columna ${columnNumber}-Nivel ${level}`,
        aisle: aisleId,
        column: columnNumber,
        shelf: level,
      })

      if (result.error) {
        console.error("[v0] Database error adding reference:", result.error)
        setError("Error adding reference to database")
        return
      }

      setAisles((prev) => {
        const updated = prev.map((aisle) => {
          if (aisle.id === aisleId) {
            return {
              ...aisle,
              columns: aisle.columns.map((column) => {
                if (column.id === columnId) {
                  return {
                    ...column,
                    boxes: column.boxes.map((box) => {
                      if (box.level === level) {
                        const existingRef = box.references.find((ref) => ref.id === refData.id)
                        if (existingRef) {
                          return {
                            ...box,
                            references: box.references.map((ref) =>
                              ref.id === refData.id ? { ...ref, quantity: ref.quantity + refData.quantity } : ref,
                            ),
                          }
                        } else {
                          return {
                            ...box,
                            references: [...box.references, refData],
                          }
                        }
                      }
                      return box
                    }),
                  }
                }
                return column
              }),
            }
          }
          return aisle
        })
        console.log("[v0] Reference added and saved to database")
        return updated
      })
    } catch (err) {
      console.error("[v0] Error adding reference:", err)
      setError("Error adding reference")
    }
  }

  const updateReferenceQuantity = (aisleId: string, columnId: string, level: number, refId: string, change: number) => {
    setAisles((prev) => {
      const updated = prev.map((aisle) => {
        if (aisle.id === aisleId) {
          return {
            ...aisle,
            columns: aisle.columns.map((column) => {
              if (column.id === columnId) {
                return {
                  ...column,
                  boxes: column.boxes.map((box) => {
                    if (box.level === level) {
                      return {
                        ...box,
                        references: box.references
                          .map((ref) => {
                            if (ref.id === refId) {
                              const newQuantity = Math.max(0, ref.quantity + change)
                              return { ...ref, quantity: newQuantity }
                            }
                            return ref
                          })
                          .filter((ref) => ref.quantity > 0),
                      }
                    }
                    return box
                  }),
                }
              }
              return column
            }),
          }
        }
        return aisle
      })
      console.log("[v0] Reference quantity updated and will be saved")
      return updated
    })
  }

  const updateReferenceQuantityDirect = (
    aisleId: string,
    columnId: string,
    level: number,
    refId: string,
    newQuantity: number,
  ) => {
    if (newQuantity < 0) return

    setAisles((prev) => {
      const updated = prev.map((aisle) => {
        if (aisle.id === aisleId) {
          return {
            ...aisle,
            columns: aisle.columns.map((column) => {
              if (column.id === columnId) {
                return {
                  ...column,
                  boxes: column.boxes.map((box) => {
                    if (box.level === level) {
                      return {
                        ...box,
                        references: box.references
                          .map((ref) => {
                            if (ref.id === refId) {
                              return { ...ref, quantity: newQuantity }
                            }
                            return ref
                          })
                          .filter((ref) => ref.quantity > 0),
                      }
                    }
                    return box
                  }),
                }
              }
              return column
            }),
          }
        }
        return aisle
      })
      console.log("[v0] Reference quantity updated directly and will be saved")
      return updated
    })
  }

  const updateBoxName = (aisleId: string, columnId: string, level: number, newName: string) => {
    if (!newName.trim()) return

    setAisles((prev) =>
      prev.map((aisle) => {
        if (aisle.id === aisleId) {
          return {
            ...aisle,
            columns: aisle.columns.map((column) => {
              if (column.id === columnId) {
                return {
                  ...column,
                  boxes: column.boxes.map((box) => {
                    if (box.level === level) {
                      return { ...box, name: newName.trim() }
                    }
                    return box
                  }),
                }
              }
              return column
            }),
          }
        }
        return aisle
      }),
    )
  }

  const promptForReferenceData = (): { id: string; name: string; quantity: number } | null => {
    const refId = prompt("Código de referencia:")?.trim()
    const refName = prompt("Nombre del producto:")?.trim()
    const quantityStr = prompt("Cantidad inicial:")?.trim()
    const quantity = Number.parseInt(quantityStr || "0")

    if (!refId || !refName || !quantityStr || quantity <= 0 || isNaN(quantity)) {
      if (refId || refName || quantityStr) {
        alert("Por favor, introduce valores válidos para todos los campos.")
      }
      return null
    }

    return { id: refId, name: refName, quantity }
  }

  const handleAddReference = (aisleId: string, columnId: string, level: number) => {
    const refData = promptForReferenceData()
    if (refData) {
      addReference(aisleId, columnId, level, refData)
      if (confirm("¿Desea añadir otra referencia a esta caja?")) {
        setTimeout(() => handleAddReference(aisleId, columnId, level), 100)
      }
    }
  }

  const getAccessibilityIcon = (accessibility: number) => {
    return accessibility === 3 ? "🟢" : accessibility === 2 ? "🟡" : "🔴"
  }

  const getAccessibilityColor = (accessibility: number) => {
    if (accessibility === 3) return "bg-green-500 border-green-600"
    if (accessibility === 2) return "bg-yellow-500 border-yellow-600"
    return "bg-red-500 border-red-600"
  }

  const getAccessibilityText = (accessibility: number) => {
    if (accessibility === 3) return "Alta"
    if (accessibility === 2) return "Media"
    return "Baja"
  }

  const getProximityText = (proximity: number) => {
    if (proximity >= 8) return "Muy cerca (2-3 pasos)"
    if (proximity >= 6) return "Cerca (4-6 pasos)"
    if (proximity >= 4) return "Media distancia (7-10 pasos)"
    return "Lejos (11+ pasos)"
  }

  const getProximityColor = (proximity: number) => {
    if (proximity >= 8) return "text-green-700 bg-green-100"
    if (proximity >= 6) return "text-blue-700 bg-blue-100"
    if (proximity >= 4) return "text-yellow-700 bg-yellow-100"
    return "text-red-700 bg-red-100"
  }

  const getProximityIcon = (proximity: number) => {
    return proximity >= 7 ? "🚪" : proximity >= 4 ? "🚶" : "🏃"
  }

  const getWarehouseStats = () => {
    let totalReferences = 0
    let totalUnits = 0
    let lowStockItems = 0
    let mediumStockItems = 0
    let highStockItems = 0
    const uniqueReferences = new Set<string>()
    let occupiedBoxes = 0
    const totalBoxes = aisles.length * 7 * 6 // 9 aisles * 7 columns * 6 levels
    let highAccessibilityBoxes = 0
    let mediumAccessibilityBoxes = 0
    let lowAccessibilityBoxes = 0

    aisles.forEach((aisle) => {
      aisle.columns.forEach((column) => {
        column.boxes.forEach((box) => {
          if (box.references.length > 0) {
            occupiedBoxes++
            const accessibility = calculateAccessibility(aisle, column.id, box.level)
            if (accessibility === 3) highAccessibilityBoxes++
            else if (accessibility === 2) mediumAccessibilityBoxes++
            else lowAccessibilityBoxes++
          }

          box.references.forEach((ref) => {
            totalReferences++
            totalUnits += ref.quantity
            uniqueReferences.add(ref.id)

            if (ref.quantity <= 50) lowStockItems++
            else if (ref.quantity <= 100) mediumStockItems++
            else highStockItems++
          })
        })
      })
    })

    const occupancyRate = totalBoxes > 0 ? (occupiedBoxes / totalBoxes) * 100 : 0

    return {
      totalReferences,
      totalUnits,
      uniqueReferences: uniqueReferences.size,
      lowStockItems,
      mediumStockItems,
      highStockItems,
      occupiedBoxes,
      totalBoxes,
      occupancyRate,
      highAccessibilityBoxes,
      mediumAccessibilityBoxes,
      lowAccessibilityBoxes,
    }
  }

  const stats = getWarehouseStats()

  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      searchReference(searchTerm)
    }
  }

  const resetWarehouse = async () => {
    try {
      setIsLoading(true)

      // Clear database
      const existingItems = await db.selectItems()
      if (existingItems.data) {
        for (const item of existingItems.data) {
          await db.deleteItem(item.id)
        }
      }

      const initialData = createInitialData()
      setAisles(initialData)
      await saveToDatabase(initialData)
      console.log("[v0] Warehouse reset to initial state in database")
    } catch (err) {
      console.error("[v0] Error resetting warehouse:", err)
      setError("Error resetting warehouse")
    } finally {
      setIsLoading(false)
    }
  }

  const exportData = async () => {
    try {
      const result = await db.selectItems()
      if (result.data) {
        const dataStr = JSON.stringify(result.data, null, 2)
        const dataBlob = new Blob([dataStr], { type: "application/json" })
        const url = URL.createObjectURL(dataBlob)
        const link = document.createElement("a")
        link.href = url
        link.download = `warehouse-inventory-${new Date().toISOString().split("T")[0]}.json`
        link.click()
        URL.revokeObjectURL(url)
        console.log("[v0] Database data exported successfully")
      }
    } catch (error) {
      console.error("[v0] Error exporting data:", error)
      setError("Error exporting data")
    }
  }

  const pushToDatabase = async () => {
    setIsLoading(true)
    setError(null)

    try {
      console.log("[v0] Manual push initiated")
      await saveToDatabase(aisles)

      // Force reload from database to ensure sync
      const freshData = await loadFromDatabase()
      if (freshData) {
        setAisles(freshData)
      }

      console.log("[v0] Manual push completed successfully")
    } catch (error) {
      console.error("[v0] Error during manual push:", error)
      setError("Error durante la sincronización manual")
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white p-6 font-sans flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#124734] mx-auto mb-4"></div>
          <p className="text-[#124734] text-lg">Cargando datos del almacén...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white p-6 font-sans">
      <div className="max-w-7xl mx-auto">
        {error && (
          <Alert className="mb-6 border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              {error}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setError(null)}
                className="ml-2 text-red-600 hover:text-red-800"
              >
                Cerrar
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Header con marca ORTOCANIS */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-medium text-[#124734] mb-2">ORTOCANIS</h1>
          <h2 className="text-2xl font-normal text-[#124734] mb-2">Sistema de Gestión de Almacén</h2>
          <p className="text-[#0f3d2a] font-normal">Control inteligente de inventario con Google Apps Script</p>
          <div className="mt-2 flex items-center justify-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-[#0f3d2a]">Sincronización con Google Apps Script activa</span>
          </div>
        </div>

        <Tabs defaultValue="layout" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-[#f0f7f4] border-[#a7e6c1]">
            <TabsTrigger value="layout" className="data-[state=active]:bg-[#124734] data-[state=active]:text-white">
              Layout del Almacén
            </TabsTrigger>
            <TabsTrigger value="search" className="data-[state=active]:bg-[#124734] data-[state=active]:text-white">
              Búsqueda Inteligente
            </TabsTrigger>
            <TabsTrigger value="inventory" className="data-[state=active]:bg-[#124734] data-[state=active]:text-white">
              Gestión de Inventario
            </TabsTrigger>
            <TabsTrigger value="reports" className="data-[state=active]:bg-[#124734] data-[state=active]:text-white">
              Resumen del Almacén
            </TabsTrigger>
          </TabsList>

          <TabsContent value="layout" className="space-y-6">
            {/* Botón para mostrar mapa */}
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-semibold text-[#124734]">Distribución del Almacén</h3>
              <Button
                onClick={() => setShowMap(!showMap)}
                variant="outline"
                className="border-[#124734] text-[#124734] hover:bg-[#f0f7f4]"
              >
                <Map className="h-4 w-4 mr-2" />
                {showMap ? "Ocultar Mapa" : "Mostrar Mapa"}
              </Button>
            </div>

            {/* Mapa del almacén */}
            {showMap && (
              <Card className="border-[#a7e6c1]">
                <CardHeader className="bg-[#f0f7f4]">
                  <CardTitle className="text-[#124734]">Mapa del Almacén ORTOCANIS</CardTitle>
                  <CardDescription className="text-[#0f3d2a]">
                    Vista general de la distribución - Haz clic en un pasillo para ver detalles
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="mb-6">
                    <div className="grid grid-cols-9 gap-3 max-w-4xl mx-auto">
                      {aisles.map((aisle) => {
                        const totalBoxes = aisle.columns.reduce(
                          (total, col) => total + col.boxes.filter((box) => box.references.length > 0).length,
                          0,
                        )
                        const totalCapacity = aisle.columns.length * 6 // 6 niveles por columna
                        const occupancyRate = (totalBoxes / totalCapacity) * 100

                        return (
                          <div
                            key={aisle.id}
                            className="text-center cursor-pointer transform hover:scale-105 transition-transform"
                            onClick={() => {
                              const element = document.getElementById(`aisle-${aisle.id}`)
                              element?.scrollIntoView({ behavior: "smooth" })
                            }}
                          >
                            <div
                              className={`border-3 rounded-xl p-4 mb-2 ${
                                occupancyRate > 80
                                  ? "bg-red-100 border-red-400"
                                  : occupancyRate > 50
                                    ? "bg-yellow-100 border-yellow-400"
                                    : "bg-green-100 border-green-400"
                              }`}
                            >
                              <div className="font-bold text-[#124734] text-xl mb-1">{aisle.id}</div>
                              <div className="text-xs text-[#0f3d2a] mb-1">{aisle.name}</div>
                              <div className="text-xs text-gray-600">
                                {totalBoxes}/{totalCapacity} cajas
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                                <div
                                  className={`h-2 rounded-full ${
                                    occupancyRate > 80
                                      ? "bg-red-500"
                                      : occupancyRate > 50
                                        ? "bg-yellow-500"
                                        : "bg-green-500"
                                  }`}
                                  style={{ width: `${occupancyRate}%` }}
                                ></div>
                              </div>
                            </div>
                            <div className="text-xs text-[#0f3d2a]">
                              {getProximityText(calculateProximity(aisle.id))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div className="mt-6 flex justify-center gap-6 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-green-500 rounded"></div>
                        <span>Baja ocupación (&lt;50%)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                        <span>Media ocupación (50-80%)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 bg-red-500 rounded"></div>
                        <span>Alta ocupación (&gt;80%)</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid gap-6">
              {aisles.map((aisle) => (
                <Card key={aisle.id} id={`aisle-${aisle.id}`} className="overflow-hidden border-[#a7e6c1]">
                  <CardHeader className="bg-[#f0f7f4]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg text-[#124734]">{aisle.name}</CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingName({ type: "aisle", id: aisle.id })
                            setNewName(aisle.name)
                          }}
                          className="text-[#0f3d2a] hover:text-[#124734]"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="bg-[#f0f7f4] text-[#124734]">
                          ID: {aisle.id}
                        </Badge>
                        <Badge variant="outline" className="border-[#7dd3a0] text-[#124734]">
                          {getProximityIcon(calculateProximity(aisle.id))} Proximidad: {calculateProximity(aisle.id)}/9
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
                      {aisle.columns.map((column) => (
                        <Card key={column.id} className="border-2 border-[#a7e6c1]">
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-sm font-medium text-[#124734]">{column.name}</CardTitle>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingName({ type: "column", id: column.id })
                                  setNewName(column.name)
                                }}
                                className="text-[#0f3d2a] hover:text-[#124734]"
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                            </div>
                            <Badge variant="outline" className="text-xs border-[#7dd3a0] text-[#124734]">
                              {column.id}
                            </Badge>
                          </CardHeader>
                          <CardContent className="space-y-2">
                            {/* Mostrar cajas de arriba hacia abajo (nivel 6 al 1) */}
                            {column.boxes
                              .slice()
                              .reverse()
                              .map((box) => {
                                const hasContent = box.references.length > 0
                                const accessibility = calculateAccessibility(aisle, column.id, box.level)

                                return (
                                  <div
                                    key={box.id}
                                    className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                                      hasContent
                                        ? "bg-[#f0f7f4] border-[#7dd3a0]"
                                        : "bg-gray-50 border-gray-200 hover:bg-[#a7e6c1]"
                                    }`}
                                    onClick={() => handleAddReference(aisle.id, column.id, box.level)}
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-medium text-gray-600">
                                        Nivel {box.level} - {box.name}
                                      </span>
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs">{getAccessibilityIcon(accessibility)}</span>
                                        <Badge variant="secondary" className="text-xs">
                                          {hasContent ? `${box.references.length} refs` : "Vacío"}
                                        </Badge>
                                      </div>
                                    </div>
                                    {hasContent ? (
                                      <div className="space-y-1">
                                        {box.references.map((ref) => (
                                          <div key={ref.id} className="flex items-center justify-between text-xs">
                                            <span className="truncate font-medium text-[#124734]">{ref.id}</span>
                                            <Badge
                                              variant="outline"
                                              className={`text-xs ${
                                                ref.quantity <= 50
                                                  ? "border-red-300 text-red-700 bg-red-50"
                                                  : ref.quantity <= 100
                                                    ? "border-yellow-300 text-yellow-700 bg-yellow-50"
                                                    : "border-[#7dd3a0] text-[#124734] bg-[#f0f7f4]"
                                              }`}
                                            >
                                              {ref.quantity}
                                            </Badge>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="text-xs text-gray-400 text-center">Click para añadir</div>
                                    )}
                                  </div>
                                )
                              })}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="search" className="space-y-6">
            <Card className="border-[#a7e6c1]">
              <CardHeader className="bg-[#f0f7f4]">
                <CardTitle className="flex items-center gap-2 text-[#124734]">
                  <Search className="h-5 w-5" />
                  Búsqueda Inteligente de Referencias
                </CardTitle>
                <CardDescription className="text-[#0f3d2a]">
                  Busca por código de referencia o nombre del producto. Los resultados se ordenan por prioridad,
                  accesibilidad y proximidad.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4 mb-6">
                  <Button onClick={() => setShowSearchDialog(true)} variant="outline" className="border-gray-300">
                    <Search className="w-4 h-4 mr-2" />
                    Buscar Referencia
                  </Button>
                </div>

                <Dialog open={showSearchDialog} onOpenChange={setShowSearchDialog}>
                  <DialogContent className="border-[#a7e6c1]">
                    <DialogHeader>
                      <DialogTitle className="text-[#124734]">Buscar Referencia</DialogTitle>
                      <DialogDescription className="text-[#0f3d2a]">
                        Introduce el código de referencia o nombre del producto que deseas buscar.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="searchInput" className="text-[#124734]">
                          Término de búsqueda
                        </Label>
                        <Input
                          id="searchInput"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          onKeyPress={handleSearchKeyPress}
                          placeholder="Ej: REF001 o Producto..."
                          className="border-[#7dd3a0] focus:border-[#124734]"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setShowSearchDialog(false)}
                          className="border-[#7dd3a0] text-[#124734]"
                        >
                          Cancelar
                        </Button>
                        <Button
                          onClick={() => {
                            searchReference(searchTerm)
                            setShowSearchDialog(false)
                          }}
                          disabled={!searchTerm.trim()}
                          className="bg-[#124734] hover:bg-[#0f3d2a]"
                        >
                          <Search className="w-4 h-4 mr-2" />
                          Buscar
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                {searchResults && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Package className="h-5 w-5 text-[#0f3d2a]" />
                        <h3 className="text-lg font-semibold text-[#124734]">
                          Resultados para: "{searchResults.reference}"
                        </h3>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2">
                        <span className="text-blue-800 font-semibold">Total: {searchResults.totalUnits} unidades</span>
                        <span className="text-blue-600 text-sm ml-2">
                          en {searchResults.locations.length} ubicaciones
                        </span>
                      </div>
                    </div>

                    {searchResults.locations.length === 0 ? (
                      <Alert className="border-[#a7e6c1]">
                        <AlertCircle className="h-4 w-4 text-[#0f3d2a]" />
                        <AlertDescription className="text-[#124734]">
                          No se encontraron ubicaciones para esta referencia.
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <div className="grid gap-3">
                        {searchResults.locations.map((location, index) => (
                          <Card key={index} className="border-l-4 border-l-green-500">
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <div className="flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-[#0f3d2a]" />
                                    <span className="font-medium text-[#124734]">
                                      {location.aisle} → {location.column} → Nivel {location.level}
                                    </span>
                                  </div>
                                  <Badge variant="outline" className="border-[#7dd3a0] text-[#124734]">
                                    {location.referenceId}: {location.quantity} unidades
                                  </Badge>
                                  <Badge variant="secondary" className="bg-blue-50 border-blue-200 text-blue-700">
                                    {location.referenceName}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="text-sm text-[#0f3d2a]">
                                    <div className="flex items-center gap-1 mb-1">
                                      <span
                                        className={`px-2 py-1 rounded text-xs ${getProximityColor(location.proximity)}`}
                                      >
                                        {getProximityText(location.proximity)}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <span>Acceso: {getAccessibilityIcon(location.accessibility)}</span>
                                      <span className="text-xs">
                                        {location.accessibility === 3
                                          ? "Fácil"
                                          : location.accessibility === 2
                                            ? "Medio"
                                            : "Difícil"}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-xs text-gray-500">Puntuación</div>
                                    <div className="font-bold text-[#124734]">{location.totalScore.toFixed(1)}/5.0</div>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            {/* Mapa Interactivo */}
            <Card className="border-[#a7e6c1] mt-6">
              <CardHeader className="bg-[#f0f7f4]">
                <CardTitle className="text-[#124734]">Mapa Interactivo del Almacén</CardTitle>
                <CardDescription className="text-[#0f3d2a]">
                  Las cajas resaltadas muestran los productos buscados con colores según accesibilidad
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="bg-gray-50 p-6 rounded-lg border-2 border-gray-200">
                  <div className="flex justify-end mb-2">
                    <div className="bg-[#7dd3a0] text-[#124734] px-3 py-1 rounded-md text-sm font-semibold border border-[#5cb85c]">
                      🚪 ENTRADA
                    </div>
                  </div>
                  <div className="flex mb-4">
                    <div className="flex-1 space-y-2">
                      {aisles.map((aisle) => (
                        <div key={aisle.id} className="bg-white border-2 border-[#7dd3a0] rounded-lg p-3 shadow-md">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="text-sm font-bold text-[#124734]">PASILLO {aisle.id}</div>
                            <div className="text-xs text-gray-600">(Entrada por Columna 1 →)</div>
                          </div>
                          <div className="grid grid-cols-7 gap-1">
                            {aisle.columns
                              .slice()
                              .reverse()
                              .map((column, colIndex) => (
                                <div key={column.id} className="text-center">
                                  <div className="text-xs text-gray-600 mb-1">C{7 - colIndex}</div>
                                  <div className="space-y-1">
                                    {column.boxes
                                      .slice()
                                      .reverse()
                                      .map((box) => {
                                        const highlightedBox = highlightedBoxes.find(
                                          (h) =>
                                            h.aisleId === aisle.id && h.columnId === column.id && h.level === box.level,
                                        )
                                        const hasContent = box.references.length > 0

                                        let boxClass =
                                          "w-8 h-6 border rounded text-xs flex items-center justify-center "

                                        if (highlightedBox) {
                                          const accessibilityColor = getAccessibilityColor(highlightedBox.accessibility)
                                          boxClass += `${accessibilityColor} text-white font-bold animate-pulse`
                                        } else if (hasContent) {
                                          boxClass += "bg-blue-100 border-blue-300 text-blue-800"
                                        } else {
                                          boxClass += "bg-green-100 border-green-300 text-green-600"
                                        }

                                        return (
                                          <div
                                            key={box.id}
                                            className={boxClass}
                                            title={`${box.name} - ${hasContent ? box.references.length + " refs" : "Vacío (Alta accesibilidad)"}`}
                                          >
                                            {box.level}
                                          </div>
                                        )
                                      })}
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="w-16 bg-yellow-200 border-2 border-yellow-400 rounded-lg p-2 ml-4 flex items-center justify-center">
                      <div className="text-center text-xs font-bold text-yellow-800 transform -rotate-90">PASILLO</div>
                    </div>
                  </div>

                  <div className="mt-6 flex justify-center gap-4 text-sm flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-green-500 rounded"></div>
                      <span>Alta accesibilidad / Vacío</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-yellow-500 rounded"></div>
                      <span>Accesibilidad media</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-red-500 rounded"></div>
                      <span>Baja accesibilidad</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-blue-100 border border-blue-300 rounded"></div>
                      <span>Ocupado</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-gray-100 border border-gray-300 rounded"></div>
                      <span>Vacío</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-yellow-100 border border-yellow-300 rounded"></div>
                      <span>Pasillo</span>
                    </div>
                  </div>

                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="text-sm text-blue-800">
                      <strong>Navegación:</strong> Entrada por pasillo recto → Acceso a cada pasillo por Columna 1 →
                      Columnas 1-7 (sin salida por Columna 7, retroceder para salir)
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inventory" className="space-y-6">
            <Card className="border-[#a7e6c1]">
              <CardHeader className="bg-[#f0f7f4]">
                <CardTitle className="text-[#124734]">Gestión de Inventario</CardTitle>
                <CardDescription className="text-[#0f3d2a]">
                  Actualiza las cantidades de productos en cada ubicación
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-96">
                  <div className="space-y-4">
                    {aisles.map((aisle) => (
                      <div key={aisle.id} className="space-y-3">
                        <h3 className="font-semibold text-lg border-b border-[#a7e6c1] pb-2 text-[#124734]">
                          {aisle.name} {getProximityIcon(calculateProximity(aisle.id))}
                        </h3>
                        {aisle.columns.map((column) => (
                          <div key={column.id} className="ml-4 space-y-2">
                            <h4 className="font-medium text-[#124734]">{column.name}</h4>
                            {column.boxes
                              .filter((box) => box.references.length > 0)
                              .map((box) => {
                                const accessibility = calculateAccessibility(aisle, column.id, box.level)
                                return (
                                  <div
                                    key={box.id}
                                    className="ml-4 border border-[#a7e6c1] rounded-lg p-3 bg-[#f0f7f4]"
                                  >
                                    <div className="font-medium text-sm text-[#124734] mb-2 flex items-center gap-2 justify-between">
                                      <div className="flex items-center gap-2">
                                        Nivel {box.level} - {box.name}
                                        <span>{getAccessibilityIcon(accessibility)}</span>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                          const newName = prompt(
                                            `Nuevo nombre para la caja (Nivel ${box.level}):`,
                                            box.name,
                                          )
                                          if (newName && newName.trim()) {
                                            updateBoxName(aisle.id, column.id, box.level, newName.trim())
                                          }
                                        }}
                                        className="text-[#0f3d2a] hover:text-[#124734]"
                                      >
                                        <Edit2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                    <div className="space-y-2">
                                      {box.references.map((ref) => (
                                        <div
                                          key={ref.id}
                                          className="flex items-center justify-between bg-white p-2 rounded border border-[#a7e6c1]"
                                        >
                                          <div>
                                            <span className="font-medium text-[#124734]">{ref.id}</span>
                                            <span className="text-sm text-[#0f3d2a] ml-2">{ref.name}</span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() =>
                                                updateReferenceQuantity(aisle.id, column.id, box.level, ref.id, -1)
                                              }
                                              className="border-[#7dd3a0] text-[#124734] hover:bg-[#f0f7f4]"
                                            >
                                              <Minus className="h-3 w-3" />
                                            </Button>
                                            <Input
                                              type="number"
                                              value={ref.quantity}
                                              onChange={(e) => {
                                                const newQuantity = Number.parseInt(e.target.value) || 0
                                                updateReferenceQuantityDirect(
                                                  aisle.id,
                                                  column.id,
                                                  box.level,
                                                  ref.id,
                                                  newQuantity,
                                                )
                                              }}
                                              className="w-16 text-center border-[#7dd3a0] focus:border-[#124734]"
                                              min="0"
                                            />
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() =>
                                                updateReferenceQuantity(aisle.id, column.id, box.level, ref.id, 1)
                                              }
                                              className="border-[#7dd3a0] text-[#124734] hover:bg-[#f0f7f4]"
                                            >
                                              <Plus className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )
                              })}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports" className="space-y-6">
            <Card className="border-[#a7e6c1]">
              <CardHeader className="bg-[#f0f7f4]">
                <CardTitle className="text-[#124734]">Resumen del Almacén ORTOCANIS</CardTitle>
                <CardDescription className="text-[#0f3d2a]">
                  Estadísticas completas del inventario y distribución del almacén
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg text-[#124734] border-b border-[#a7e6c1] pb-2">
                      📊 Estadísticas Generales
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center p-3 bg-[#f0f7f4] rounded-lg border border-[#a7e6c1]">
                        <span className="text-[#124734]">Pasillos Totales</span>
                        <span className="font-bold text-[#124734]">{aisles.length}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-[#f0f7f4] rounded-lg border border-[#a7e6c1]">
                        <span className="text-[#124734]">Columnas Totales</span>
                        <span className="font-bold text-[#124734]">
                          {aisles.reduce((total, aisle) => total + aisle.columns.length, 0)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-[#f0f7f4] rounded-lg border border-[#a7e6c1]">
                        <span className="text-[#124734]">Cajas Totales</span>
                        <span className="font-bold text-[#124734]">{stats.totalBoxes}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <span className="text-blue-700">Cajas Ocupadas</span>
                        <span className="font-bold text-blue-800">{stats.occupiedBoxes}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg border border-purple-200">
                        <span className="text-purple-700">Tasa de Ocupación</span>
                        <span className="font-bold text-purple-800">{stats.occupancyRate.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg text-[#124734] border-b border-[#a7e6c1] pb-2">
                      📦 Inventario
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center p-3 bg-[#f0f7f4] rounded-lg border border-[#a7e6c1]">
                        <span className="text-[#124734]">Referencias Únicas</span>
                        <span className="font-bold text-[#124734]">{stats.uniqueReferences}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-[#f0f7f4] rounded-lg border border-[#a7e6c1]">
                        <span className="text-[#124734]">Total Referencias</span>
                        <span className="font-bold text-[#124734]">{stats.totalReferences}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <span className="text-blue-700">Total Unidades</span>
                        <span className="font-bold text-blue-800">{stats.totalUnits.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-orange-50 rounded-lg border border-orange-200">
                        <span className="text-orange-700">Promedio por Referencia</span>
                        <span className="font-bold text-orange-800">
                          {stats.totalReferences > 0 ? Math.round(stats.totalUnits / stats.totalReferences) : 0}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg text-[#124734] border-b border-[#a7e6c1] pb-2">
                      ⚠️ Niveles de Stock
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg border border-red-200">
                        <span className="text-red-700">Stock Bajo (≤50)</span>
                        <span className="font-bold text-red-800">{stats.lowStockItems}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                        <span className="text-yellow-700">Stock Medio (51-100)</span>
                        <span className="font-bold text-yellow-800">{stats.mediumStockItems}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-200">
                        <span className="text-green-700">Stock Alto ({">"}100)</span>
                        <span className="font-bold text-green-800">{stats.highStockItems}</span>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="text-sm text-gray-600 mb-2">Distribución de Stock</div>
                        <div className="flex h-4 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="bg-red-500"
                            style={{
                              width: `${stats.totalReferences > 0 ? (stats.lowStockItems / stats.totalReferences) * 100 : 0}%`,
                            }}
                          ></div>
                          <div
                            className="bg-yellow-500"
                            style={{
                              width: `${stats.totalReferences > 0 ? (stats.mediumStockItems / stats.totalReferences) * 100 : 0}%`,
                            }}
                          ></div>
                          <div
                            className="bg-green-500"
                            style={{
                              width: `${stats.totalReferences > 0 ? (stats.highStockItems / stats.totalReferences) * 100 : 0}%`,
                            }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg text-[#124734] border-b border-[#a7e6c1] pb-2">
                      🎯 Accesibilidad
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg border border-green-200">
                        <span className="text-green-700 flex items-center gap-2">🟢 Alta Accesibilidad</span>
                        <span className="font-bold text-green-800">{stats.highAccessibilityBoxes}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                        <span className="text-yellow-700 flex items-center gap-2">🟡 Media Accesibilidad</span>
                        <span className="font-bold text-yellow-800">{stats.mediumAccessibilityBoxes}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg border border-red-200">
                        <span className="text-red-700 flex items-center gap-2">🔴 Baja Accesibilidad</span>
                        <span className="font-bold text-red-800">{stats.lowAccessibilityBoxes}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg text-[#124734] border-b border-[#a7e6c1] pb-2">
                      🚪 Proximidad a Entrada
                    </h3>
                    <div className="space-y-2">
                      {aisles.map((aisle) => {
                        const proximity = calculateProximity(aisle.id)
                        const occupiedBoxes = aisle.columns.reduce(
                          (total, col) => total + col.boxes.filter((box) => box.references.length > 0).length,
                          0,
                        )
                        return (
                          <div
                            key={aisle.id}
                            className="flex justify-between items-center p-2 bg-gray-50 rounded border"
                          >
                            <span className="text-gray-700 flex items-center gap-2">
                              {getProximityIcon(proximity)} {aisle.name}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-600">{occupiedBoxes} cajas</span>
                              <Badge variant="outline" className="text-xs">
                                {proximity}/9
                              </Badge>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-semibold text-lg text-[#124734] border-b border-[#a7e6c1] pb-2">
                      ⚡ Eficiencia
                    </h3>
                    <div className="space-y-3">
                      <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="text-blue-700 text-sm mb-1">Capacidad Utilizada</div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-blue-200 rounded-full h-3">
                            <div
                              className="bg-blue-600 h-3 rounded-full"
                              style={{ width: `${stats.occupancyRate}%` }}
                            ></div>
                          </div>
                          <span className="font-bold text-blue-800">{stats.occupancyRate.toFixed(1)}%</span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg border border-purple-200">
                        <span className="text-purple-700">Cajas Disponibles</span>
                        <span className="font-bold text-purple-800">{stats.totalBoxes - stats.occupiedBoxes}</span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                        <span className="text-indigo-700">Densidad Promedio</span>
                        <span className="font-bold text-indigo-800">
                          {stats.occupiedBoxes > 0 ? (stats.totalReferences / stats.occupiedBoxes).toFixed(1) : 0}{" "}
                          refs/caja
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-4">
                  <Button variant="destructive" onClick={resetWarehouse}>
                    Reiniciar Almacén
                  </Button>
                  <Button variant="secondary" onClick={exportData}>
                    Exportar Datos
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={editingName !== null} onOpenChange={() => setEditingName(null)}>
          <DialogContent className="border-[#a7e6c1]">
            <DialogHeader>
              <DialogTitle className="text-[#124734]">
                Editar {editingName?.type === "aisle" ? "Pasillo" : "Columna"}
              </DialogTitle>
              <DialogDescription className="text-[#0f3d2a]">
                Introduce el nuevo nombre para este {editingName?.type === "aisle" ? "pasillo" : "columna"}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="newName" className="text-[#124734]">
                  Nuevo nombre
                </Label>
                <Input
                  id="newName"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && newName.trim() && editingName) {
                      updateName(editingName.type, editingName.id, newName)
                    }
                  }}
                  placeholder="Introduce el nuevo nombre..."
                  className="border-[#7dd3a0] focus:border-[#124734]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setEditingName(null)}
                  className="border-[#7dd3a0] text-[#124734]"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => editingName && updateName(editingName.type, editingName.id, newName)}
                  disabled={!newName.trim()}
                  className="bg-[#124734] hover:bg-[#0f3d2a]"
                >
                  Guardar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
