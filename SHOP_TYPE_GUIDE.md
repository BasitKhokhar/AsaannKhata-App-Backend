# Shop Category Guide for AsaannKhata

This guide explains how shop categories work in this system and how a shop owner should choose the right product type while adding products.

---

## 1) How shop category works in this app

Every shop belongs to one shop type.

Examples:
- Aluminum & Glass
- Tiles, Marble & Granite
- Pharmacy
- Grocery Store
- Restaurant
- Mobile Shop

Each shop type has:
- a label (shop name like "Pharmacy")
- a default stock type
- suggested starting categories

When a new shop is created, the system automatically creates default categories for that shop based on its shop type.

Example:
- Pharmacy shop gets starter categories such as Tablets, Syrups, Injections, Surgical
- Glass shop gets starter categories such as windows, sheets, mirrors, accessories

Important rule:
- Categories are created inside each shop only.
- One category belongs to one shop, not globally across all shops.
- A product must be added under a category belonging to that shop.

---

## 2) How to know the correct product type while adding product

The app supports these product stock types:

### A. Quantity product
Use this when the product is sold by count or unit.

Examples:
- soap
- rice bag
- shampoo bottle
- medicines
- shoes
- snacks
- shirts
- bulbs

Typical stock field:
- quantity

Best for:
- items counted by piece or unit
- products sold in complete units

Example:
- 10 bottles of shampoo
- 25 pairs of shoes
- 50 medicine packets

### B. Area product
Use this when the product is sold by area/sheet size.

Examples:
- glass sheet
- plywood board
- tiles
- marble slab
- laminate sheet
- acrylic sheet

Typical stock field:
- width, height, area
- usually measured in cm, feet, inch, meter

Best for:
- flat materials sold by size and area
- sheet/slab based materials

Example:
- 8 ft glass sheet
- 12 ft plywood board
- 2 x 4 marble tile panel

### C. Length product
Use this when the product is sold by length.

Examples:
- pipe
- wire
- cable
- timber
- rod
- PVC pipe
- steel bar

Typical stock field:
- length in cm or meter

Best for:
- continuous products sold by linear measurement

Example:
- 20 meter cable
- 15 foot PVC pipe
- 5 meter wood plank

### D. Pack product
Use this when the product is sold in packs and loose units are also possible.

Examples:
- medicine box with 10 tablets inside
- biscuit pack
- bottled soft drinks in cartons
- packaged snacks
- stationery packs

Typical stock field:
- packSize
- stockPacks
- stockLooseUnits

Best for:
- products sold both as full packs and loose pieces

Example:
- 12 bottles in one carton and some loose bottles sold individually
- 24 tablets in one pack, some loose tablets sold separately

---

## 3) Simple rule for choosing the correct product type

Ask this question:

"How is the item measured when sold?"

- Counted by piece? -> Quantity
- Sold by sheet/size/area? -> Area
- Sold by length? -> Length
- Sold by pack and separately loose? -> Pack

---

## 4) Shop category guide with examples

Below is the recommended shop category logic used by this system.

### 1. Aluminum & Glass
This category is for shops dealing with glass panels, aluminum sections, doors, windows, and related materials.

Recommended product types:
- Area: glass, acrylic, sheet, panel, mirror
- Length: aluminum angle, channel, rod, frame profile
- Quantity: fittings, screws, handles, clips

Example product names:
- 8ft Transparent Glass Sheet
- Grey Mirror Panel
- Aluminum Window Frame Profile
- Glass Door Handle

How to add:
- If it is a large flat sheet -> Area
- If it is a rod/profile piece -> Length
- If it is small hardware -> Quantity

---

### 2. Tiles, Marble & Granite
This is for construction and finishing materials sold by slab, tile, or stone panel.

Recommended product types:
- Area: tiles, marble slab, granite slab, stone sheet
- Quantity: adhesives, grout, tile spacers, polish

Example product names:
- Marble Floor Slab
- Ceramic Wall Tile
- Granite Countertop Piece
- Tile Adhesive

How to add:
- If the product is measured by size or area -> Area
- If it is a consumable or accessory -> Quantity

---

### 3. Plywood & MDF Boards
This category handles boards, sheets, and panel materials.

Recommended product types:
- Area: plywood sheet, MDF sheet, laminated board
- Quantity: hinges, screws, glue, fittings

Example product names:
- 8x4 MDF Board
- Waterproof Plywood Sheet
- Cabinet Hinges
- Wood Glue

How to add:
- If sold by board size -> Area
- If sold as accessories -> Quantity

---

### 4. Fabric & Textiles
This is for cloth, cloth rolls, drapery, and textile materials.

Recommended product types:
- Area: fabric roll, cloth by meter/yard, bedding fabric
- Quantity: buttons, zippers, threads, sewing items

Example product names:
- Cotton Fabric Roll
- Curtain Cloth
- Zipper Pack
- Sewing Thread

How to add:
- If material is sold by width and length -> Area
- If item is a small fixed item -> Quantity

---

### 5. Pipe & PVC
This is for plumbing and PVC products.

Recommended product types:
- Length: PVC pipe, pipe length, water pipe, drainage pipe
- Quantity: pipe joints, elbows, connectors, fixings

Example product names:
- 1-inch PVC Pipe
- Half-inch Water Pipe
- Pipe Elbow Joint
- Pipe Thread Seal

How to add:
- If the product is sold by length -> Length
- If it is a fitting or connector -> Quantity

---

### 6. Wood & Timber
This is for timber and wood products sold by board length or cut size.

Recommended product types:
- Length: timber plank, beam, wood strip, board piece
- Quantity: nails, screws, wood polish

Example product names:
- 12ft Timber Beam
- Wooden Plank
- Sandpaper
- Wood Screws

How to add:
- If sold by linear dimension -> Length
- If sold as small accessory -> Quantity

---

### 7. Cable & Wire
This category includes electrical and communication cable.

Recommended product types:
- Length: electrical wire, cable roll, network cable
- Quantity: connectors, plugs, switches, clips

Example product names:
- Copper Wire Roll
- Electric Cable
- Plug Socket
- Cable Connector

How to add:
- If sold by measurement or roll length -> Length
- If sold as fixed hardware -> Quantity

---

### 8. Hardware & Electrical
This covers small hardware, electrical items, and basic fittings.

Recommended product types:
- Quantity: switch, socket, bulb, screw, nut, bolt, tape
- Pack: accessory kits

Example product names:
- Electrical Switch
- LED Bulb
- Door Hinges
- Screw Pack

How to add:
- If the item is a single product sold by piece -> Quantity
- If it is sold in a bundle -> Pack

---

### 9. General Store
This is for mixed retail inventory.

Recommended product types:
- Quantity: cleaning items, daily-use items, household goods
- Pack: bundle products, combo sets

Example product names:
- Detergent
- Broom
- Floor Cleaner
- Storage Basket

How to add:
- If sold as one item -> Quantity
- If sold as set or pack -> Pack

---

### 10. Stationery
This is for school and office supplies.

Recommended product types:
- Quantity: pen, notebook, file, marker
- Pack: pack of pens, pack of files, bundle sets

Example product names:
- Ball Pen
- A4 Copy Notebook
- File Folder
- Marker Pack

How to add:
- Single item sale -> Quantity
- Multi-item bundle -> Pack

---

### 11. Footwear
This is for shoes, sandals, and footwear items.

Recommended product types:
- Quantity: each pair counted as one unit
- Pack: shoe care kit or combo set

Example product names:
- Men Running Shoe
- Ladies Sandal
- Kids Sneaker
- Shoe Care Kit

How to add:
- Single pair -> Quantity
- Pack of accessories -> Pack

---

### 12. Pharmacy
This is for medicines, injections, syrups, and related health items.

Recommended product types:
- Quantity: medicine bottles, packets, capsules
- Pack: medical kits, multi-item packs

Example product names:
- Paracetamol Tablets
- Cough Syrup
- Antibiotic Injection
- Surgical Mask Pack

How to add:
- If sold as a bottle/packet/unit -> Quantity
- If sold as a set or box of products -> Pack

Important note:
- Pharmacy products usually depend on unit sales more than on length or area.

---

### 13. Mobile Accessories
This is for accessories and small devices linked to phones and gadgets.

Recommended product types:
- Quantity: earphones, chargers, cases, cables
- Pack: combo kit

Example product names:
- USB Cable
- Phone Charger
- Phone Case
- Earbuds

How to add:
- Single item -> Quantity
- Combo set -> Pack

---

### 14. Grocery Store
This category is for daily food and household groceries.

Recommended product types:
- Quantity: rice, flour, oil, spices, beans, snacks
- Pack: combo deals, family packs, multipacks

Example product names:
- Rice 10kg
- Cooking Oil
- Salt Packet
- Snack Combo Pack

How to add:
- Food sold by the item or bag -> Quantity
- Multi-item retail pack -> Pack

---

### 15. Milk Shop
This is for dairy products and daily essentials.

Recommended product types:
- Quantity: milk packets, yogurt cups, eggs, butter packs
- Pack: family combo, dairy bundle

Example product names:
- Milk Packet
- Yogurt Cup
- Eggs Tray
- Fresh Cream Pack

How to add:
- If sold as one packet or unit -> Quantity
- If sold as a combined bundle -> Pack

---

### 16. Atta Chakki
This is for flour and grain products.

Recommended product types:
- Quantity: flour bags, grain packets
- Pack: family packs or combo bags

Example product names:
- Wheat Flour Bag
- Atta Packet
- Whole Grain Pack
- Flour Combo

How to add:
- If sold as a bag or packet -> Quantity
- If sold as a bundle -> Pack

---

### 17. Clothing Store
This is for garments and textile apparel.

Recommended product types:
- Quantity: shirt, kurta, jeans, dress, children clothing
- Pack: few-piece combo set

Example product names:
- Cotton Shirt
- Muslim Kurta
- Ladies Dress
- Kids Combo Set

How to add:
- Single clothing item -> Quantity
- Multi-piece set -> Pack

---

### 18. Bakery
This is for baked and daily food items.

Recommended product types:
- Quantity: bread, bun, bakery item, pastry
- Pack: family packs, combo trays

Example product names:
- Bread Loaf
- Chicken Bun
- Cake Slice
- Party Pack

How to add:
- Single bakery item -> Quantity
- Multi-item pack -> Pack

---

### 19. Restaurant
This category is for food items sold in a restaurant or food service business.

Recommended product types:
- Quantity: plate, burger, meal, tea, dessert
- Pack: meal combo, family box

Example product names:
- Chicken Burger
- Zinger Meal
- Tea
- Family Deal

How to add:
- One item sold as a unit -> Quantity
- Multi-item deal -> Pack

---

### 20. Salon & Spa
This is for beauty and grooming products and services.

Recommended product types:
- Quantity: shampoo, cream, serum, nail kit
- Pack: grooming combo, treatment pack

Example product names:
- Hair Shampoo
- Hair Oil
- Facial Kit
- Salon Combo Pack

How to add:
- Single product -> Quantity
- Bundle or treatment set -> Pack

---

### 21. Auto Parts
This is for vehicle-related parts and accessories.

Recommended product types:
- Quantity: bulb, filter, battery, belt, clamp
- Length: wire, hose, pipe
- Pack: repair kit

Example product names:
- Air Filter
- Car Battery
- Brake Cable
- Repair Kit

How to add:
- Small replacement part -> Quantity
- Cable/hose measured by length -> Length
- Repair set -> Pack

---

### 22. Mobile Shop
This category is for mobile devices and mobile-related selling products.

Recommended product types:
- Quantity: mobile phone, charger, protector, power bank
- Pack: combo set

Example product names:
- Smartphone
- Mobile Charger
- Screen Protector
- Combo Kit

How to add:
- Individual product -> Quantity
- Bundle kit -> Pack

---

## 5) Quick product selection examples

### Example 1: Glass shop
Product: glass panel
- Category: Aluminum & Glass
- Stock type: Area
- Reason: it is sold by sheet/size

### Example 2: Plumbing shop
Product: PVC pipe
- Category: Pipe & PVC
- Stock type: Length
- Reason: it is sold by length

### Example 3: Grocery store
Product: rice bag
- Category: Grocery Store
- Stock type: Quantity
- Reason: sold by bag/unit count

### Example 4: Pharmacy
Product: syrup bottle
- Category: Pharmacy
- Stock type: Quantity
- Reason: sold as unit bottle

### Example 5: Hardware shop
Product: cable roll
- Category: Cable & Wire
- Stock type: Length
- Reason: sold by cable length

### Example 6: Stationery shop
Product: pen pack
- Category: Stationery
- Stock type: Pack
- Reason: sold in set or box

---

## 6) Best practice for shop owners

When creating products, follow this simple rule:

1. Select the correct shop category.
2. Select the correct category inside that shop.
3. Choose stock type based on how the item is sold.
4. Enter the exact price and stock detail matching the chosen type.
5. Use the default stock type of the shop as a guide, but do not force wrong product entry.

If a product is sold by size, use Area or Length.
If a product is sold by count, use Quantity.
If a product is sold in packs and loose units, use Pack.

---

## 7) Final summary

This app is designed around the shop type and product stock mode:
- Shop type decides the business vertical.
- Suggested categories are auto-created for the shop.
- Product category keeps products organized inside the shop.
- Stock type decides how the product is measured and tracked.

In short:
- area-based products = sheet/slab/size-based items
- length-based products = pipe/wire/timber-based items
- quantity-based products = piece/unit products
- pack-based products = pack, bundle, or combo items

This is the easiest way for a shop owner to know how to add products correctly.
