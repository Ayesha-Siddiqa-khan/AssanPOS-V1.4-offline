import { Buffer } from 'buffer';

export type LanguageCode = 'english' | 'urdu';



type TranslationPair = readonly [english: string, urdu: string];



const TRANSLATION_DICTIONARY: Record<string, TranslationPair> = {

  'Loading...': ['Loading...', 'Ù„ÙˆÚˆ ÛÙˆ Ø±ÛØ§ ÛÛ’...'],

  "Today's Revenue": ["Today's Revenue", 'Ø¢Ø¬ Ú©ÛŒ Ø¢Ù…Ø¯Ù†ÛŒ'],

  'sales': ['sales', 'ÙØ±ÙˆØ®Øª'],

  "Today's Expenses": ["Today's Expenses", 'Ø¢Ø¬ Ú©Û’ Ø§Ø®Ø±Ø§Ø¬Ø§Øª'],

  'entries': ['entries', 'Ø§Ù†Ø¯Ø±Ø§Ø¬Ø§Øª'],

  'Low Stock Items': ['Low Stock Items', 'Ú©Ù… Ø§Ø³Ù¹Ø§Ú© Ø§Ø´ÛŒØ§Ø¡'],

  'items': ['items', 'Ø§Ø´ÛŒØ§Ø¡'],

  'Pending Payments': ['Pending Payments', 'Ø¨Ù‚Ø§ÛŒØ§ Ø§Ø¯Ø§Ø¦ÛŒÚ¯ÛŒØ§Úº'],

  'payments': ['payments', 'Ø§Ø¯Ø§Ø¦ÛŒÚ¯ÛŒØ§Úº'],

  'Quick Actions': ['Quick Actions', 'ÙÙˆØ±ÛŒ Ú©Ø§Ø±Ø±ÙˆØ§Ø¦ÛŒØ§Úº'],

  'New Sale': ['New Sale', 'Ù†Ø¦ÛŒ ÙØ±ÙˆØ®Øª'],

  'Customers': ['Customers', 'Ú©Ø³Ù¹Ù…Ø±Ø²'],

  'Inventory': ['Inventory', 'Ø§Ù†ÙˆÛŒÙ†Ù¹Ø±ÛŒ'],

  'Expenditure': ['Expenditure', 'Ø§Ø®Ø±Ø§Ø¬Ø§Øª'],

  'Reports': ['Reports', 'Reports'],

  'Recent Sales': ['Recent Sales', 'Ø­Ø§Ù„ÛŒÛ ÙØ±ÙˆØ®Øª'],

  'Report Type': ['Report Type', 'Report Type'],

  'Generated at': ['Generated at', 'Generated at'],

  'Metric': ['Metric', 'Metric'],

  'Units': ['Units', 'Units'],

  'Method': ['Method', 'Method'],

  'Share report': ['Share report', 'Share report'],

  'Share via WhatsApp': ['Share via WhatsApp', 'Share via WhatsApp'],

  'CSV export failed': ['CSV export failed', 'CSV export failed'],

  'PDF export failed': ['PDF export failed', 'PDF export failed'],

  'Sharing not available on this device': ['Sharing not available on this device', 'Sharing not available on this device'],

  'Database Backup': ['Database Backup', 'Database Backup'],

  'WhatsApp not installed': ['WhatsApp not installed', 'WhatsApp not installed'],

  'WhatsApp share failed': ['WhatsApp share failed', 'WhatsApp share failed'],

  'Backup Data': ['Backup Data', 'Backup Data'],
  'No backups found': ['No backups found', 'No backups found'],

  'Restore Backup': ['Restore Backup', 'Restore Backup'],
  'Restore Inventory Backup': ['Restore Inventory Backup', 'Restore Inventory Backup'],
  'Restoring inventory...': ['Restoring inventory...', 'Restoring inventory...'],
  'Load items from your backup file': [
    'Load items from your backup file',
    'Load items from your backup file',
  ],
  'Backup Inventory Items': ['Backup Inventory Items', 'Backup Inventory Items'],
  'Preparing inventory backup...': [
    'Preparing inventory backup...',
    'Preparing inventory backup...',
  ],
  'Save all items as backup file': ['Save all items as backup file', 'Save all items as backup file'],
  'Auto Backup Scheduler': ['Auto Backup Scheduler', 'Auto Backup Scheduler'],
  'Automatically creates offline backups in the background.': [
    'Automatically creates offline backups in the background.',
    'Automatically creates offline backups in the background.',
  ],
  'Inventory Backup': ['Inventory Backup', 'Inventory Backup'],
  'Choose where to save your inventory backup.': [
    'Choose where to save your inventory backup.',
    'Choose where to save your inventory backup.',
  ],
  'File Name': ['File Name', 'File Name'],
  'Give this file a descriptive name so you can find it later.': [
    'Give this file a descriptive name so you can find it later.',
    'Give this file a descriptive name so you can find it later.',
  ],
  'Tip: Select your Downloads folder when prompted.': [
    'Tip: Select your Downloads folder when prompted.',
    'Tip: Select your Downloads folder when prompted.',
  ],
  'Save to Device': ['Save to Device', 'Save to Device'],
  'Share Backup': ['Share Backup', 'Share Backup'],
  'No file selected': ['No file selected', 'No file selected'],
  'Enabled': ['Enabled', 'Enabled'],
  'Disabled': ['Disabled', 'Disabled'],
  'Backup file was empty': ['Backup file was empty', 'Backup file was empty'],
  'Please check your backup file': ['Please check your backup file', 'Please check your backup file'],
  'Enter a file name first': ['Enter a file name first', 'Enter a file name first'],
  'Owner': ['Owner', '\u0645\u0627\u0644\u06a9'],
  'Cashier': ['Cashier', 'Cashier'],
  'Inventory backup saved to your device': [
    'Inventory backup saved to your device',
    'Inventory backup saved to your device',
  ],
  'Saved to Downloads as {file}': ['Saved to Downloads as {file}', 'Saved to Downloads as {file}'],
  'Saved to app storage as {file}': [
    'Saved to app storage as {file}',
    'Saved to app storage as {file}',
  ],
  'Download permission not granted': [
    'Download permission not granted',
    'Download permission not granted',
  ],
  'Storage Access Framework not available': [
    'Storage Access Framework not available',
    'Storage Access Framework not available',
  ],
  'This device cannot grant Downloads access. Use Share to move backups.': [
    'This device cannot grant Downloads access. Use Share to move backups.',
    'This device cannot grant Downloads access. Use Share to move backups.',
  ],
  'Please select a folder to continue': [
    'Please select a folder to continue',
    'Please select a folder to continue',
  ],
  'Could not save backup': ['Could not save backup', 'Could not save backup'],
  'Saving...': ['Saving...', 'Saving...'],
  'Preparing...': ['Preparing...', 'Preparing...'],
  'e.g., inventory-aug.json': ['e.g., inventory-aug.json', 'e.g., inventory-aug.json'],
  'No saved backups found in Downloads': [
    'No saved backups found in Downloads',
    'No saved backups found in Downloads',
  ],
  'Choose a backup file manually.': [
    'Choose a backup file manually.',
    'Choose a backup file manually.',
  ],
  'Restore {file} from Downloads?': [
    'Restore {file} from Downloads?',
    'Restore {file} from Downloads?',
  ],
  'Restore from Downloads': ['Restore from Downloads', 'Restore from Downloads'],
  'Choose File': ['Choose File', 'Choose File'],
  'Last inventory backup': ['Last inventory backup', 'Last inventory backup'],
  'File': ['File', 'File'],
  'Location': ['Location', 'Location'],
  'Downloads folder (visible in Files app)': [
    'Downloads folder (visible in Files app)',
    'Downloads folder (visible in Files app)',
  ],
  'App storage (share the file to move it)': [
    'App storage (share the file to move it)',
    'App storage (share the file to move it)',
  ],
  'Grant Downloads Access': ['Grant Downloads Access', 'Grant Downloads Access'],
  'Downloads folder linked': ['Downloads folder linked', 'Downloads folder linked'],
  'Backups will now save there automatically.': [
    'Backups will now save there automatically.',
    'Backups will now save there automatically.',
  ],
  'Permission required': ['Permission required', 'Permission required'],
  'Select the Downloads folder to save backups there.': [
    'Select the Downloads folder to save backups there.',
    'Select the Downloads folder to save backups there.',
  ],
  'No inventory backup to share': ['No inventory backup to share', 'No inventory backup to share'],
  'Share inventory backup file': ['Share inventory backup file', 'Share inventory backup file'],
  'Could not share backup file': ['Could not share backup file', 'Could not share backup file'],
  'Show PIN': ['Show PIN', 'Show PIN'],
  'Failed to clear inventory': ['Failed to clear inventory', 'Failed to clear inventory'],
  'Inventory is already empty': ['Inventory is already empty', 'Inventory is already empty'],
  'No local backups found': ['No local backups found', 'No local backups found'],
  'Backup restored': ['Backup restored', 'Backup restored'],
  'Restart the app to see changes.': ['Restart the app to see changes.', 'Restart the app to see changes.'],
  'Pick Backup File': ['Pick Backup File', 'Pick Backup File'],
  'Latest Local Backup': ['Latest Local Backup', 'Latest Local Backup'],
  'Choose how you want to restore your database.': [
    'Choose how you want to restore your database.',
    'Choose how you want to restore your database.',
  ],
  'Please select a .db backup file': ['Please select a .db backup file', 'Please select a .db backup file'],
  'Could not open folder picker': ['Could not open folder picker', 'Could not open folder picker'],

  'Reset Database (Fix Issues)': ['Reset Database (Fix Issues)', 'Reset Database (Fix Issues)'],

  'Backup coming soon': ['Backup coming soon', 'Backup coming soon'],

  'Restore coming soon': ['Restore coming soon', 'Restore coming soon'],

  'Reset coming soon': ['Reset coming soon', 'Reset coming soon'],

  'See All': ['See All', 'Ø³Ø¨ Ø¯ÛŒÚ©Ú¾ÛŒÚº'],

  'No sales yet': ['No sales yet', 'Ø§Ø¨Ú¾ÛŒ ØªÚ© Ú©ÙˆØ¦ÛŒ ÙØ±ÙˆØ®Øª Ù†ÛÛŒÚº'],

  'Walk-in Customer': ['Walk-in Customer', 'ÙˆØ§Ú© Ø§ÙÙ† Ú©Ø³Ù¹Ù…Ø±'],

  'Items': ['Items', 'Ø§Ø´ÛŒØ§Ø¡'],

  'Total': ['Total', 'Ú©Ù„'],

  'Payment': ['Payment', 'Ø§Ø¯Ø§Ø¦ÛŒÚ¯ÛŒ'],

  'Due': ['Due', 'Ø¨Ù‚Ø§ÛŒØ§'],

  'Search products...': ['Search products...', 'Ù¾Ø±ÙˆÚˆÚ©Ù¹Ø³ ØªÙ„Ø§Ø´ Ú©Ø±ÛŒÚº...'],



  'Search Action': ['Search Action', 'Search Action'],



  'Manual Add': ['Manual Add', 'Manual Add'],



  'Review search results before adding': [

    'Review search results before adding',

    'Review search results before adding',

  ],



  'Instant Add to Cart': ['Instant Add to Cart', 'Instant Add to Cart'],



  'Automatically add the first match to the cart': [

    'Automatically add the first match to the cart',

    'Automatically add the first match to the cart',

  ],

  'Products': ['Products', 'Ù¾Ø±ÙˆÚˆÚ©Ù¹Ø³'],

  'Total Stock': ['Total Stock', 'Ú©Ù„ Ø§Ø³Ù¹Ø§Ú©'],

  'Low Stock': ['Low Stock', 'Ú©Ù… Ø§Ø³Ù¹Ø§Ú©'],

  'No products found': ['No products found', 'Ú©ÙˆØ¦ÛŒ Ù¾Ø±ÙˆÚˆÚ©Ù¹ Ù†ÛÛŒÚº Ù…Ù„Ø§'],

  'In Stock': ['In Stock', 'Ø¯Ø³ØªÛŒØ§Ø¨ Ø§Ø³Ù¹Ø§Ú©'],

  'Stock': ['Stock', 'Ø§Ø³Ù¹Ø§Ú©'],

  'Price': ['Price', 'Ù‚ÛŒÙ…Øª'],

  'Search customers...': ['Search customers...', 'Ú©Ø³Ù¹Ù…Ø±Ø² ØªÙ„Ø§Ø´ Ú©Ø±ÛŒÚº...'],

  'Total Customers': ['Total Customers', 'Ú©Ù„ Ú©Ø³Ù¹Ù…Ø±Ø²'],

  'With Dues': ['With Dues', 'Ø¨Ù‚Ø§ÛŒØ§ ÙˆØ§Ù„Û’'],

  'No customers found': ['No customers found', 'Ú©ÙˆØ¦ÛŒ Ú©Ø³Ù¹Ù…Ø± Ù†ÛÛŒÚº Ù…Ù„Ø§'],

  'No customers yet': ['No customers yet', 'Ø§Ø¨Ú¾ÛŒ ØªÚ© Ú©ÙˆØ¦ÛŒ Ú©Ø³Ù¹Ù…Ø± Ù†ÛÛŒÚº'],

  'Total Purchases': ['Total Purchases', 'Ú©Ù„ Ø®Ø±ÛŒØ¯Ø§Ø±ÛŒ'],

  'Credit': ['Credit', 'Ú©Ø±ÛŒÚˆÙ¹'],

  'Total Sales': ['Total Sales', 'Ú©Ù„ ÙØ±ÙˆØ®Øª'],

  'Credit issued': ['Credit issued', 'Credit issued'],

  'Revenue': ['Revenue', 'Ø¢Ù…Ø¯Ù†ÛŒ'],

  'Overall Performance': ['Overall Performance', 'Ù…Ø¬Ù…ÙˆØ¹ÛŒ Ú©Ø§Ø±Ú©Ø±Ø¯Ú¯ÛŒ'],

  'Total Revenue': ['Total Revenue', 'Ú©Ù„ Ø¢Ù…Ø¯Ù†ÛŒ'],

  'Expenses': ['Expenses', 'Ø§Ø®Ø±Ø§Ø¬Ø§Øª'],

  'COGS': ['COGS', 'Ù…Ø§Ù„ Ú©ÛŒ Ù„Ø§Ú¯Øª'],

  'Net Profit': ['Net Profit', 'Ø®Ø§Ù„Øµ Ù…Ù†Ø§ÙØ¹'],

  'Sales': ['Sales', 'ÙØ±ÙˆØ®Øª'],

  'This Week': ['This Week', 'Ø§Ø³ ÛÙØªÛ’'],

  'Sales Count': ['Sales Count', 'ÙØ±ÙˆØ®Øª Ú©ÛŒ ØªØ¹Ø¯Ø§Ø¯'],

  'Payment Methods': ['Payment Methods', 'Ø§Ø¯Ø§Ø¦ÛŒÚ¯ÛŒ Ú©Û’ Ø·Ø±ÛŒÙ‚Û’'],

  'Quick Stats': ['Quick Stats', 'ÙÙˆØ±ÛŒ Ø§Ø¹Ø¯Ø§Ø¯ Ùˆ Ø´Ù…Ø§Ø±'],

  'Total Products': ['Total Products', 'Ú©Ù„ Ù¾Ø±ÙˆÚˆÚ©Ù¹Ø³'],

  'Total Expenditures': ['Total Expenditures', 'Ú©Ù„ Ø§Ø®Ø±Ø§Ø¬Ø§Øª'],

  'Customer Account': ['Customer Account', 'Ú©Ø³Ù¹Ù…Ø± Ø§Ú©Ø§Ø¤Ù†Ù¹'],

  'Coming Soon': ['Coming Soon', 'Ø¬Ù„Ø¯ Ø¢ Ø±ÛØ§ ÛÛ’'],

  'Product Selection': ['Product Selection', 'Ù¾Ø±ÙˆÚˆÚ©Ù¹ Ú©Ø§ Ø§Ù†ØªØ®Ø§Ø¨'],

  'Vendor Account': ['Vendor Account', 'ÙˆÛŒÙ†ÚˆØ± Ø§Ú©Ø§Ø¤Ù†Ù¹'],

  'Purchase Entry': ['Purchase Entry', 'Ø®Ø±ÛŒØ¯Ø§Ø±ÛŒ Ú©Ø§ Ø§Ù†Ø¯Ø±Ø§Ø¬'],

  'Cart Summary': ['Cart Summary', 'Ú©Ø§Ø±Ù¹ Ú©Ø§ Ø®Ù„Ø§ØµÛ'],

  'Clear Cart': ['Clear Cart', 'Ú©Ø§Ø±Ù¹ ØµØ§Ù Ú©Ø±ÛŒÚº'],

  'Proceed to Payment': ['Proceed to Payment', 'Ø§Ø¯Ø§Ø¦ÛŒÚ¯ÛŒ Ú©ÛŒ Ø·Ø±Ù Ø¨Ú‘Ú¾ÛŒÚº'],

  'Your cart is empty': ['Your cart is empty', 'Ø¢Ù¾ Ú©Ø§ Ú©Ø§Ø±Ù¹ Ø®Ø§Ù„ÛŒ ÛÛ’'],

  'Quantity': ['Quantity', 'Ù…Ù‚Ø¯Ø§Ø±'],

  'Remove': ['Remove', 'ÛÙ¹Ø§ Ø¯ÛŒÚº'],

  'Subtotal': ['Subtotal', 'Ø°ÛŒÙ„ÛŒ Ú©Ù„'],

  'Discount': ['Discount', 'Ø±Ø¹Ø§ÛŒØª'],

  'Tax Rate (%)': ['Tax Rate (%)', 'Ù¹ÛŒÚ©Ø³ Ú©ÛŒ Ø´Ø±Ø­ (%)'],

  'Tax': ['Tax', 'Ù¹ÛŒÚ©Ø³'],

  'Total Due': ['Total Due', 'Ú©Ù„ Ø¨Ù‚Ø§ÛŒØ§'],

  'Selected Customer': ['Selected Customer', 'Ù…Ù†ØªØ®Ø¨ Ú©Ø³Ù¹Ù…Ø±'],

  'Select Customer': ['Select Customer', 'Ú©Ø³Ù¹Ù…Ø± Ù…Ù†ØªØ®Ø¨ Ú©Ø±ÛŒÚº'],

  'Sale completed successfully': ['Sale completed successfully', 'ÙØ±ÙˆØ®Øª Ú©Ø§Ù…ÛŒØ§Ø¨ÛŒ Ø³Û’ Ù…Ú©Ù…Ù„ ÛÙˆ Ú¯Ø¦ÛŒ'],

  'Select at least one item': ['Select at least one item', 'Ú©Ù… Ø§Ø² Ú©Ù… Ø§ÛŒÚ© Ø¢Ø¦Ù¹Ù… Ù…Ù†ØªØ®Ø¨ Ú©Ø±ÛŒÚº'],

  'Please select a customer first': ['Please select a customer first', 'Ø¨Ø±Ø§Û Ú©Ø±Ù… Ù¾ÛÙ„Û’ Ú©Ø³Ù¹Ù…Ø± Ù…Ù†ØªØ®Ø¨ Ú©Ø±ÛŒÚº'],

  'Something went wrong': ['Something went wrong', 'Ú©Ú†Ú¾ ØºÙ„Ø· ÛÙˆ Ú¯ÛŒØ§'],

  'Amount Paid': ['Amount Paid', 'Ø§Ø¯Ø§ Ø´Ø¯Û Ø±Ù‚Ù…'],

  'Amount Received (Rs.)': ['Amount Received (Rs.)', 'ÙˆØµÙˆÙ„ Ø´Ø¯Û Ø±Ù‚Ù… (Ø±ÙˆÙ¾Û’)'],

  'Amount Received': ['Amount Received', 'ÙˆØµÙˆÙ„ Ø´Ø¯Û Ø±Ù‚Ù…'],

  'Cash': ['Cash', 'Ù†Ù‚Ø¯'],

  'Online': ['Online', 'Ø¢Ù† Ù„Ø§Ø¦Ù†'],

  'Customer Credit': ['Customer Credit', 'Ú©Ø³Ù¹Ù…Ø± Ú©Ø±ÛŒÚˆÙ¹'],

  'Walk-in Customer Name (optional)': [

    'Walk-in Customer Name (optional)',

    'ÙˆØ§Ú© Ø§ÙÙ† Ú©Ø³Ù¹Ù…Ø± Ù†Ø§Ù… (Ø§Ø®ØªÛŒØ§Ø±ÛŒ)',

  ],

  'Enter name': ['Enter name', 'Ù†Ø§Ù… Ø¯Ø±Ø¬ Ú©Ø±ÛŒÚº'],

  'Walk-in customers are not saved to the customer list.': [

    'Walk-in customers are not saved to the customer list.',

    'ÙˆØ§Ú© Ø§ÙÙ† Ú©Ø³Ù¹Ù…Ø± Ú©Ùˆ ÙÛØ±Ø³Øª Ù…ÛŒÚº Ù…Ø­ÙÙˆØ¸ Ù†ÛÛŒÚº Ú©ÛŒØ§ Ø¬Ø§ØªØ§Û”',

  ],

  'Payment Method': ['Payment Method', 'Ø§Ø¯Ø§Ø¦ÛŒÚ¯ÛŒ Ú©Ø§ Ø·Ø±ÛŒÙ‚Û'],

  'Credit Available': ['Credit Available', 'Ø¯Ø³ØªÛŒØ§Ø¨ Ú©Ø±ÛŒÚˆÙ¹'],

  'Credit Used': ['Credit Used', 'Ø§Ø³ØªØ¹Ù…Ø§Ù„ Ø´Ø¯Û Ú©Ø±ÛŒÚˆÙ¹'],

  'Due Amount': ['Due Amount', 'Ø¨Ù‚Ø§ÛŒØ§ Ø±Ù‚Ù…'],

  'Remaining Balance': ['Remaining Balance', 'Ø¨Ø§Ù‚ÛŒ Ù…Ø§Ù†Ø¯Û Ø±Ù‚Ù…'],

  'Return Change': ['Return Change', 'ÙˆØ§Ù¾Ø³ Ú©ÛŒ Ú¯Ø¦ÛŒ Ø±Ù‚Ù…'],

  'Sale Completed': ['Sale Completed', 'ÙØ±ÙˆØ®Øª Ù…Ú©Ù…Ù„ ÛÙˆÚ¯Ø¦ÛŒ'],

  'Receipt': ['Receipt', 'Ø±Ø³ÛŒØ¯'],

  'Your Store': ['Your Store', 'Ø¢Ù¾ Ú©ÛŒ Ø¯Ú©Ø§Ù†'],

  'Share Receipt on WhatsApp': ['Share Receipt on WhatsApp', 'ÙˆØ§Ù¹Ø³ Ø§ÛŒÙ¾ Ù¾Ø± Ø±Ø³ÛŒØ¯ Ø´ÛŒØ¦Ø± Ú©Ø±ÛŒÚº'],

  'Thank you for your business!': ['Thank you for your business!', 'Ø¢Ù¾ Ú©Û’ Ú©Ø§Ø±ÙˆØ¨Ø§Ø± Ú©Ø§ Ø´Ú©Ø±ÛŒÛ!'],

  'Done': ['Done', 'Ù…Ú©Ù…Ù„'],

  'Inventory Management': ['Inventory Management', 'Ø§Ù†ÙˆÛŒÙ†Ù¹Ø±ÛŒ Ù…Ù†ÛŒØ¬Ù…Ù†Ù¹'],

  'Search products, variants, or barcode...': [

    'Search products, variants, or barcode...',

    'Ù…ØµÙ†ÙˆØ¹Ø§ØªØŒ ÙˆÛŒØ±ÛŒÙ†Ù¹Ø³ ÛŒØ§ Ø¨Ø§Ø±Ú©ÙˆÚˆ ØªÙ„Ø§Ø´ Ú©Ø±ÛŒÚº...',

  ],

  'Add Product': ['Add Product', 'Ù…ØµÙ†ÙˆØ¹ Ø´Ø§Ù…Ù„ Ú©Ø±ÛŒÚº'],

  'Filter': ['Filter', 'ÙÙ„Ù¹Ø±'],
  'Edit coming soon': ['Edit coming soon', 'Edit coming soon'],
  'Delete credit entry': ['Delete credit entry', 'Delete credit entry'],
  'Are you sure you want to delete this credit entry?': ['Are you sure you want to delete this credit entry?', 'Are you sure you want to delete this credit entry?'],
  'Credit entry deleted': ['Credit entry deleted', 'Credit entry deleted'],
  'Filter by status': ['Filter by status', 'Filter by status'],
  'WhatsApp share coming soon': ['WhatsApp share coming soon', 'WhatsApp share coming soon'],

  'Stock Value': ['Stock Value', 'Ø§Ø³Ù¹Ø§Ú© ÙˆÛŒÙ„ÛŒÙˆ'],

  'Clear Inventory': ['Clear Inventory', '???????? ??? ????'],

  'This will remove all products. Continue?': ['This will remove all products. Continue?', '?? ???? ??????? ??? ?? ?? ??? ??? ?? ??? ????? ????? ????'],

  'Yes, clear inventory': ['Yes, clear inventory', '???? ???????? ??? ????'],

  'Inventory cleared': ['Inventory cleared', '???????? ??? ?? ?? ???'],

  'Due Date (optional)': ['Due Date (optional)', 'Ø¢Ø®Ø±ÛŒ ØªØ§Ø±ÛŒØ® (Ø§Ø®ØªÛŒØ§Ø±ÛŒ)'],

  'Add Product (Add Variants Next)': ['Add Product (Add Variants Next)', '????? ???? ???? (??????? ??? ??? ???? ????)'],

  'Add New Product': ['Add New Product', 'Add New Product'],

  'Product Name': ['Product Name', 'Product Name'],

  'Edit Product': ['Edit Product', 'Edit Product'],

  'Category': ['Category', 'Category'],

  'Select Category': ['Select Category', 'Select Category'],

  'This product has variants (e.g., different designs, sizes, colors)': [

    'This product has variants (e.g., different designs, sizes, colors)',

    'This product has variants (e.g., different designs, sizes, colors)',

  ],

  'e.g., Malaysian Panel, Door Lock': [

    'e.g., Malaysian Panel, Door Lock',

    'e.g., Malaysian Panel, Door Lock',

  ],

  'Quick Product Suggestions': ['Quick Product Suggestions', 'Quick Product Suggestions'],

  'Tap Manage to add your frequently used names.': [

    'Tap Manage to add your frequently used names.',

    'Tap Manage to add your frequently used names.',

  ],

  'Quick Categories': ['Quick Categories', 'Quick Categories'],

  'Tap Manage to keep your frequently used categories handy.': [

    'Tap Manage to keep your frequently used categories handy.',

    'Tap Manage to keep your frequently used categories handy.',

  ],

  'Manage Quick Categories': ['Manage Quick Categories', 'Manage Quick Categories'],

  'Keep your frequent categories handy for faster product setup.': [

    'Keep your frequent categories handy for faster product setup.',

    'Keep your frequent categories handy for faster product setup.',

  ],

  'No quick categories yet': ['No quick categories yet', 'No quick categories yet'],

  'Remove Quick Category': ['Remove Quick Category', 'Remove Quick Category'],

  'Are you sure you want to remove this quick category?': [

    'Are you sure you want to remove this quick category?',

    'Are you sure you want to remove this quick category?',

  ],

  'Quick Variant Suggestions': ['Quick Variant Suggestions', 'Quick Variant Suggestions'],

  'Tap Manage to add the variant names you use most often.': [

    'Tap Manage to add the variant names you use most often.',

    'Tap Manage to add the variant names you use most often.',

  ],

  'Manage Quick Variants': ['Manage Quick Variants', 'Manage Quick Variants'],

  'Add the variant names you use most often for one-tap autofill.': [

    'Add the variant names you use most often for one-tap autofill.',

    'Add the variant names you use most often for one-tap autofill.',

  ],

  'No quick variants yet': ['No quick variants yet', 'No quick variants yet'],

  'Remove Quick Variant': ['Remove Quick Variant', 'Remove Quick Variant'],

  'Are you sure you want to remove this quick variant?': [

    'Are you sure you want to remove this quick variant?',

    'Are you sure you want to remove this quick variant?',

  ],

  'Quick Size Options': ['Quick Size Options', 'Quick Size Options'],

  'Quick Design / Model Options': [
    'Quick Design / Model Options',
    'Quick Design / Model Options',
  ],

  'Quick Color Options': ['Quick Color Options', 'Quick Color Options'],

  'Quick Barcode Options': ['Quick Barcode Options', 'Quick Barcode Options'],

  'Quick Material / Brand Options': [
    'Quick Material / Brand Options',
    'Quick Material / Brand Options',
  ],

  'Manage Quick Size Options': ['Manage Quick Size Options', 'Manage Quick Size Options'],

  'Manage Quick Design / Model Options': [
    'Manage Quick Design / Model Options',
    'Manage Quick Design / Model Options',
  ],

  'Manage Quick Color Options': ['Manage Quick Color Options', 'Manage Quick Color Options'],

  'Manage Quick Barcode Options': ['Manage Quick Barcode Options', 'Manage Quick Barcode Options'],

  'Manage Quick Material / Brand Options': [
    'Manage Quick Material / Brand Options',
    'Manage Quick Material / Brand Options',
  ],

  'No saved options yet': ['No saved options yet', 'No saved options yet'],

  'Tap Manage to add your frequent entries.': [

    'Tap Manage to add your frequent entries.',

    'Tap Manage to add your frequent entries.',

  ],

  'Add the values you use most often for one-tap autofill.': [

    'Add the values you use most often for one-tap autofill.',

    'Add the values you use most often for one-tap autofill.',

  ],

  'Remove Quick Option': ['Remove Quick Option', 'Remove Quick Option'],

  'Are you sure you want to remove this quick option?': [

    'Are you sure you want to remove this quick option?',

    'Are you sure you want to remove this quick option?',

  ],

  'New option value': ['New option value', 'New option value'],

  'Delete Variant': ['Delete Variant', 'Delete Variant'],

  'Are you sure you want to delete this variant?': [

    'Are you sure you want to delete this variant?',

    'Are you sure you want to delete this variant?',

  ],

  'Custom Field Label (Optional)': ['Custom Field Label (Optional)', 'Custom Field Label (Optional)'],
  'Custom Field Value (Optional)': ['Custom Field Value (Optional)', 'Custom Field Value (Optional)'],
  'Enter both custom field label and value': [
    'Enter both custom field label and value',
    'Enter both custom field label and value',
  ],
  'Custom Attribute': ['Custom Attribute', 'Custom Attribute'],


  'Quick Suggestions': ['Quick Suggestions', 'Quick Suggestions'],

  'Filter Products': ['Filter Products', 'Filter Products'],

  'Show low stock only': ['Show low stock only', 'Show low stock only'],

  'Only display items at or below min stock': [

    'Only display items at or below min stock',

    'Only display items at or below min stock',

  ],

  'Show products with variants only': ['Show products with variants only', 'Show products with variants only'],

  'Hide single-SKU products': ['Hide single-SKU products', 'Hide single-SKU products'],

  'Clear Filters': ['Clear Filters', 'Clear Filters'],

  'Apply Filters': ['Apply Filters', 'Apply Filters'],

  'Manage Quick Product Names': ['Manage Quick Product Names', 'Manage Quick Product Names'],

  'Add the product names you use most often for one-tap autofill.': [

    'Add the product names you use most often for one-tap autofill.',

    'Add the product names you use most often for one-tap autofill.',

  ],

  'New suggestion name': ['New suggestion name', 'New suggestion name'],

  'No quick product suggestions yet': [

    'No quick product suggestions yet',

    'No quick product suggestions yet',

  ],

  'Please enter a name first': ['Please enter a name first', 'Please enter a name first'],

  'This name is already in the list': [

    'This name is already in the list',

    'This name is already in the list',

  ],

  'Quick list limit reached': ['Quick list limit reached', 'Quick list limit reached'],

  'Remove Quick Name': ['Remove Quick Name', 'Remove Quick Name'],

  'Are you sure you want to remove this quick name?': [

    'Are you sure you want to remove this quick name?',

    'Are you sure you want to remove this quick name?',

  ],

  'Save the base product first. You will add variant details on the next step.': ['Save the base product first. You will add variant details on the next step.', '???? ?????? ??????? ????? ????? ?? ???? ????? ??? ?????? ?? ????? ???? ???? ???'],

  'Add new category': ['Add new category', '??? ??????? ???? ????'],

  'Enter new category': ['Enter new category', '??? ??????? ??? ????'],

  'Choose from existing categories': ['Choose from existing categories', 'Choose from existing categories'],

  'Add Variants': ['Add Variants', 'Add Variants'],

  'Add Variant': ['Add Variant', 'Add Variant'],

  'Entry Mode': ['Entry Mode', 'Entry Mode'],

  'Quick Entry': ['Quick Entry', 'Quick Entry'],

  'Hide optional fields for faster input': [
    'Hide optional fields for faster input',
    'Hide optional fields for faster input',
  ],

  'Detailed Entry': ['Detailed Entry', 'Detailed Entry'],

  'Show every field for complete details': [
    'Show every field for complete details',
    'Show every field for complete details',
  ],

  'Optional fields hidden': ['Optional fields hidden', 'Optional fields hidden'],

  'Switch to Detailed Entry to add size, design, color, brand, or custom notes.': [
    'Switch to Detailed Entry to add size, design, color, brand, or custom notes.',
    'Switch to Detailed Entry to add size, design, color, brand, or custom notes.',
  ],

  'Daily': ['Daily', 'Daily'],

  'Weekly': ['Weekly', 'Weekly'],

  'Monthly': ['Monthly', 'Monthly'],

  'Backup all products, customers, sales, and credit data. Restore from backup if required. Use Reset if expenditures are missing.': ['Backup all products, customers, sales, and credit data. Restore from backup if required. Use Reset if expenditures are missing.', 'Backup all products, customers, sales, and credit data. Restore from backup if required. Use Reset if expenditures are missing.'],

  'Export CSV': ['Export CSV', 'Export CSV'],

  'Export PDF': ['Export PDF', 'Export PDF'],

  'Key Metrics': ['Key Metrics', 'Key Metrics'],

  'Cash Collected': ['Cash Collected', 'Cash Collected'],

  'Credit recovered': ['Credit recovered', 'Credit recovered'],

  'Number of Sales': ['Number of Sales', 'Number of Sales'],

  'Avg. Ticket Size': ['Avg. Ticket Size', 'Avg. Ticket Size'],

  'Daily Expenses': ['Daily Expenses', 'Daily Expenses'],

  'Top 5 Products': ['Top 5 Products', 'Top 5 Products'],

  'No data yet': ['No data yet', 'No data yet'],

  'Export Reports': ['Export Reports', 'Export Reports'],

  'Outstanding': ['Outstanding', 'Outstanding'],

  'Variants': ['Variants', 'Variants'],

  'Edit Variant': ['Edit Variant', 'Edit Variant'],

  'variants': ['variants', 'variants'],

  'Variant Name': ['Variant Name', 'Variant Name'],

  'Duplicate': ['Duplicate', 'Duplicate'],

  'Variant details copied': ['Variant details copied', 'Variant details copied'],

  'Adjust any field and tap Add Variant to save.': [
    'Adjust any field and tap Add Variant to save.',
    'Adjust any field and tap Add Variant to save.',
  ],

  'Hide Variants': ['Hide Variants', 'Hide Variants'],

  'Adjust Stock': ['Adjust Stock', 'Adjust Stock'],

  'Current stock': ['Current stock', 'Current stock'],

  'Adjustment Type': ['Adjustment Type', 'Adjustment Type'],

  'Add Stock': ['Add Stock', 'Add Stock'],

  'Remove Stock': ['Remove Stock', 'Remove Stock'],

  'Enter a valid quantity': ['Enter a valid quantity', 'Enter a valid quantity'],
  'Enter quantity': ['Enter quantity', 'Enter quantity'],

  'Stock added successfully': ['Stock added successfully', 'Stock added successfully'],

  'Stock removed successfully': ['Stock removed successfully', 'Stock removed successfully'],

  'Design': ['Design', 'Design'],

  'Size': ['Size', 'Size'],

  'Color': ['Color', 'Color'],

  'Material / Brand': ['Material / Brand', 'Material / Brand'],

  'Cost': ['Cost', 'Cost'],

  'Value': ['Value', 'Value'],

  'Adjust': ['Adjust', 'Adjust'],

  'No variants yet': ['No variants yet', 'No variants yet'],

  'Variant saved successfully': ['Variant saved successfully', 'Variant saved successfully'],

  'Variant removed successfully': ['Variant removed successfully', 'Variant removed successfully'],

  'Show Variants': ['Show Variants', 'Show Variants'],

  'Variant not found': ['Variant not found', 'Variant not found'],

  'Variant updated successfully': ['Variant updated successfully', 'Variant updated successfully'],

  'Delete Product': ['Delete Product', 'Delete Product'],

  'Are you sure you want to delete this product?': ['Are you sure you want to delete this product?', 'Are you sure you want to delete this product?'],

  'Delete': ['Delete', 'Delete'],

  'Product deleted successfully': ['Product deleted successfully', 'Product deleted successfully'],

  'Design / Model (Optional)': ['Design / Model (Optional)', 'Design / Model (Optional)'],

  'Unknown': ['Unknown', 'Unknown'],

  'Size (Optional)': ['Size (Optional)', 'Size (Optional)'],

  'Color (Optional)': ['Color (Optional)', 'Color (Optional)'],

  'Material / Brand (Optional)': [
    'Material / Brand (Optional)',
    'Material / Brand (Optional)',
  ],

  'Product not found': ['Product not found', 'Product not found'],

  'Selling Price (Rs.)': ['Selling Price (Rs.)', 'Selling Price (Rs.)'],

  'Cost Price (Rs.)': ['Cost Price (Rs.)', 'Cost Price (Rs.)'],

  'Initial Stock': ['Initial Stock', 'Initial Stock'],

  'Min. Stock': ['Min. Stock', 'Min. Stock'],

  'Barcode (Optional)': ['Barcode (Optional)', 'Barcode (Optional)'],

  'Enter barcode': ['Enter barcode', 'Enter barcode'],

  'Scan Barcode': ['Scan Barcode', 'Ø¨Ø§Ø±Ú©ÙˆÚˆ Ø§Ø³Ú©ÛŒÙ† Ú©Ø±ÛŒÚº'],

  'Scan Product Barcode': ['Scan Product Barcode', 'Scan Product Barcode'],

  'Align the barcode within the frame to capture it automatically.': [
    'Align the barcode within the frame to capture it automatically.',
    'Align the barcode within the frame to capture it automatically.',
  ],

  'Enter barcode manually or use external scanner': [
    'Enter barcode manually or use external scanner',
    'Ø¨Ø§Ø±Ú©ÙˆÚˆ Ø¯Ø³ØªÛŒ Ø·ÙˆØ± Ù¾Ø± Ø¯Ø±Ø¬ Ú©Ø±ÛŒÚº ÛŒØ§ Ø¨ÛŒØ±ÙˆÙ†ÛŒ Ø§Ø³Ú©ÛŒÙ†Ø± Ø§Ø³ØªØ¹Ù…Ø§Ù„ Ú©Ø±ÛŒÚº',
  ],
  'Enter cost price': ['Enter cost price', 'Enter cost price'],

  'Choose scanning method': ['Choose scanning method', 'Ø§Ø³Ú©ÛŒÙ† Ú©Ø±Ù†Û’ Ú©Ø§ Ø·Ø±ÛŒÙ‚Û Ù…Ù†ØªØ®Ø¨ Ú©Ø±ÛŒÚº'],

  'Scan with Camera': ['Scan with Camera', 'Ú©ÛŒÙ…Ø±Û Ø³Û’ Ø§Ø³Ú©ÛŒÙ† Ú©Ø±ÛŒÚº'],

  'Use device camera to scan barcode': [
    'Use device camera to scan barcode',
    'Ø¨Ø§Ø±Ú©ÙˆÚˆ Ø§Ø³Ú©ÛŒÙ† Ú©Ø±Ù†Û’ Ú©Û’ Ù„ÛŒÛ’ ÚˆÛŒÙˆØ§Ø¦Ø³ Ú©ÛŒÙ…Ø±Û Ø§Ø³ØªØ¹Ù…Ø§Ù„ Ú©Ø±ÛŒÚº',
  ],

  'Allow access to scan the barcode automatically.': [
    'Allow access to scan the barcode automatically.',
    'Allow access to scan the barcode automatically.',
  ],

  'Or enter manually:': ['Or enter manually:', 'ÛŒØ§ Ø¯Ø³ØªÛŒ Ø·ÙˆØ± Ù¾Ø± Ø¯Ø±Ø¬ Ú©Ø±ÛŒÚº:'],

  'Camera Permission Required': [
    'Camera Permission Required',
    'Ú©ÛŒÙ…Ø±Û Ú©ÛŒ Ø§Ø¬Ø§Ø²Øª Ø¯Ø±Ú©Ø§Ø± ÛÛ’',
  ],

  'Please grant camera permission to scan barcodes': [
    'Please grant camera permission to scan barcodes',
    'Ø¨Ø±Ø§Û Ú©Ø±Ù… Ø¨Ø§Ø±Ú©ÙˆÚˆ Ø§Ø³Ú©ÛŒÙ† Ú©Ø±Ù†Û’ Ú©Û’ Ù„ÛŒÛ’ Ú©ÛŒÙ…Ø±Û Ú©ÛŒ Ø§Ø¬Ø§Ø²Øª Ø¯ÛŒÚº',
  ],

  'Barcode Scanned': ['Barcode Scanned', 'Ø¨Ø§Ø±Ú©ÙˆÚˆ Ø§Ø³Ú©ÛŒÙ† ÛÙˆ Ú¯ÛŒØ§'],

  'Grant Access': ['Grant Access', 'Grant Access'],

  'Scan': ['Scan', 'Scan'],

  'Purchase History': ['Purchase History', 'Purchase History'],
  'View History': ['View History', 'View History'],
  'Vendor Purchase History': ['Vendor Purchase History', 'Vendor Purchase History'],
  'Purchase history for this vendor': [
    'Purchase history for this vendor',
    'Purchase history for this vendor',
  ],
  'All vendor purchases': ['All vendor purchases', 'All vendor purchases'],
  'Total spent': ['Total spent', 'Total spent'],
  'No purchases yet': ['No purchases yet', 'No purchases yet'],
  'This vendor has no recorded purchases yet.': [
    'This vendor has no recorded purchases yet.',
    'This vendor has no recorded purchases yet.',
  ],
  'Create a purchase to view its history here.': [
    'Create a purchase to view its history here.',
    'Create a purchase to view its history here.',
  ],
  'Invoice': ['Invoice', 'Invoice'],
  'Paid': ['Paid', 'Paid'],
  'Balance': ['Balance', 'Balance'],
  'more items': ['more items', 'more items'],

  'Every 12 hours': ['Every 12 hours', 'Every 12 hours'],

  'Every 3 days': ['Every 3 days', 'Every 3 days'],

  'Auto backup enabled': ['Auto backup enabled', 'Auto backup enabled'],

  'Auto backup disabled': ['Auto backup disabled', 'Auto backup disabled'],

  'Auto backup interval updated': ['Auto backup interval updated', 'Auto backup interval updated'],

  'Could not update auto backup': ['Could not update auto backup', 'Could not update auto backup'],

  'Add Tax': ['Add Tax', 'Add Tax'],

  'Hide Tax Fields': ['Hide Tax Fields', 'Hide Tax Fields'],

  'Package Not Installed': ['Package Not Installed', 'Ù¾ÛŒÚ©ÛŒØ¬ Ø§Ù†Ø³Ù¹Ø§Ù„ Ù†ÛÛŒÚº ÛÛ’'],

  'Please install expo-barcode-scanner package first. See INSTALL_BARCODE_SCANNER.md for instructions.': [
    'Please install expo-barcode-scanner package first. See INSTALL_BARCODE_SCANNER.md for instructions.',
    'Ø¨Ø±Ø§Û Ú©Ø±Ù… Ù¾ÛÙ„Û’ expo-barcode-scanner Ù¾ÛŒÚ©ÛŒØ¬ Ø§Ù†Ø³Ù¹Ø§Ù„ Ú©Ø±ÛŒÚºÛ” ÛØ¯Ø§ÛŒØ§Øª Ú©Û’ Ù„ÛŒÛ’ INSTALL_BARCODE_SCANNER.md Ø¯ÛŒÚ©Ú¾ÛŒÚºÛ”',
  ],

  'Camera scanner requires expo-barcode-scanner package': [
    'Camera scanner requires expo-barcode-scanner package',
    'Ú©ÛŒÙ…Ø±Û Ø§Ø³Ú©ÛŒÙ†Ø± expo-barcode-scanner Ù¾ÛŒÚ©ÛŒØ¬ Ú©ÛŒ Ø¶Ø±ÙˆØ±Øª ÛÛ’',
  ],

  'Rebuild Required': ['Rebuild Required', 'Ø¯ÙˆØ¨Ø§Ø±Û Ø¨Ù†Ø§Ù†Ø§ Ø¶Ø±ÙˆØ±ÛŒ ÛÛ’'],

  'Camera scanner requires app rebuild. Run: npx expo prebuild --clean && npx expo run:android': [
    'Camera scanner requires app rebuild. Run: npx expo prebuild --clean && npx expo run:android',
    'Ú©ÛŒÙ…Ø±Û Ø§Ø³Ú©ÛŒÙ†Ø± Ú©Û’ Ù„ÛŒÛ’ Ø§ÛŒÙ¾ Ø¯ÙˆØ¨Ø§Ø±Û Ø¨Ù†Ø§Ù†Ø§ Ø¶Ø±ÙˆØ±ÛŒ ÛÛ’',
  ],

  'Rebuild app to enable camera': [
    'Rebuild app to enable camera',
    'Ú©ÛŒÙ…Ø±Û ÙØ¹Ø§Ù„ Ú©Ø±Ù†Û’ Ú©Û’ Ù„ÛŒÛ’ Ø§ÛŒÙ¾ Ø¯ÙˆØ¨Ø§Ø±Û Ø¨Ù†Ø§Ø¦ÛŒÚº',
  ],

  'Voice Search': ['Voice Search', 'Ø¢ÙˆØ§Ø² Ø³Û’ ØªÙ„Ø§Ø´ Ú©Ø±ÛŒÚº'],

  'Listening...': ['Listening...', 'Ø³Ù† Ø±ÛØ§ ÛÛ’...'],

  'Speak the product name': ['Speak the product name', 'Ù¾Ø±ÙˆÚˆÚ©Ù¹ Ú©Ø§ Ù†Ø§Ù… Ø¨ÙˆÙ„ÛŒÚº'],

  'Type or speak the product name': [
    'Type or speak the product name',
    'Ù¾Ø±ÙˆÚˆÚ©Ù¹ Ú©Ø§ Ù†Ø§Ù… Ù¹Ø§Ø¦Ù¾ Ú©Ø±ÛŒÚº ÛŒØ§ Ø¨ÙˆÙ„ÛŒÚº',
  ],

  'E.g., Shell R3, Malaysian Clifton': [
    'E.g., Shell R3, Malaysian Clifton',
    'Ù…Ø«Ù„Ø§Ù‹ØŒ Ø´ÛŒÙ„ Ø¢Ø± 3ØŒ Ù…Ù„Ø§Ø¦ÛŒØ´ÛŒÙ† Ú©Ù„ÙÙ¹Ù†',
  ],

  'Voice Input': ['Voice Input', 'Ø¢ÙˆØ§Ø² Ø§Ù† Ù¾Ù¹'],

  'Speak now or type the product name': [
    'Speak now or type the product name',
    'Ø§Ø¨Ú¾ÛŒ Ø¨ÙˆÙ„ÛŒÚº ÛŒØ§ Ù¾Ø±ÙˆÚˆÚ©Ù¹ Ú©Ø§ Ù†Ø§Ù… Ù¹Ø§Ø¦Ù¾ Ú©Ø±ÛŒÚº',
  ],

  'Cleared': ['Cleared', 'ØµØ§Ù Ú©Ø± Ø¯ÛŒØ§ Ú¯ÛŒØ§'],

  'Recent products cleared': ['Recent products cleared', 'Ø­Ø§Ù„ÛŒÛ Ù¾Ø±ÙˆÚˆÚ©Ù¹Ø³ ØµØ§Ù Ú©Ø± Ø¯ÛŒÛ’ Ú¯Ø¦Û’'],

  'Mobile': ['Mobile', 'Ù…ÙˆØ¨Ø§Ø¦Ù„'],

  'Unit': ['Unit', 'Unit'],

  'Piece': ['Piece', 'Piece'],

  'Box': ['Box', 'Box'],

  'Packet': ['Packet', 'Packet'],

  'Set': ['Set', 'Set'],

  'Meter': ['Meter', 'Meter'],

  'Kilogram': ['Kilogram', 'Kilogram'],

  'Litre': ['Litre', 'Litre'],

  'Service': ['Service', 'Service'],

  'Cane': ['Cane', 'Cane'],

  'Drum': ['Drum', 'Drum'],

  'Enter due date in DD-MM-YYYY format': [

    'Enter due date in DD-MM-YYYY format',

    'Ø¢Ø®Ø±ÛŒ ØªØ§Ø±ÛŒØ® DD-MM-YYYY ÙØ§Ø±Ù…ÛŒÙ¹ Ù…ÛŒÚº Ø¯Ø±Ø¬ Ú©Ø±ÛŒÚº',

  ],

  'Enter a valid due date': ['Enter a valid due date', 'Ø¯Ø±Ø³Øª Ø¢Ø®Ø±ÛŒ ØªØ§Ø±ÛŒØ® Ø¯Ø±Ø¬ Ú©Ø±ÛŒÚº'],

  'Notes (optional)': ['Notes (optional)', 'Ù†ÙˆÙ¹Ø³ (Ø§Ø®ØªÛŒØ§Ø±ÛŒ)'],

  'Complete Sale': ['Complete Sale', 'ÙØ±ÙˆØ®Øª Ù…Ú©Ù…Ù„ Ú©Ø±ÛŒÚº'],

  'Cancel': ['Cancel', 'Ù…Ù†Ø³ÙˆØ® Ú©Ø±ÛŒÚº'],

  'Name': ['Name', 'Ù†Ø§Ù…'],

  'Phone Number': ['Phone Number', 'ÙÙˆÙ† Ù†Ù…Ø¨Ø±'],

  'Email': ['Email', 'Ø§ÛŒ Ù…ÛŒÙ„'],

  'Note': ['Note', 'Ù†ÙˆÙ¹'],

  'Starting Credit': ['Starting Credit', 'Ø§Ø¨ØªØ¯Ø§Ø¦ÛŒ Ú©Ø±ÛŒÚˆÙ¹'],

  'Save Changes': ['Save Changes', 'ØªØ¨Ø¯ÛŒÙ„ÛŒØ§Úº Ù…Ø­ÙÙˆØ¸ Ú©Ø±ÛŒÚº'],

  'Create Customer': ['Create Customer', 'Ù†ÛŒØ§ Ú©Ø³Ù¹Ù…Ø± Ø¨Ù†Ø§Ø¦ÛŒÚº'],

  'Edit Customer': ['Edit Customer', 'Ú©Ø³Ù¹Ù…Ø± Ù…ÛŒÚº ØªØ±Ù…ÛŒÙ… Ú©Ø±ÛŒÚº'],

  'Product saved successfully': ['Product saved successfully', 'Product saved successfully'],

  'Invalid phone number': ['Invalid phone number', 'ØºÙ„Ø· ÙÙˆÙ† Ù†Ù…Ø¨Ø±'],

  'Product updated successfully': ['Product updated successfully', 'Product updated successfully'],

  'Required field': ['Required field', 'ÛŒÛ Ø®Ø§Ù†Û Ù„Ø§Ø²Ù…ÛŒ ÛÛ’'],

  'Add Customer': ['Add Customer', 'Ú©Ø³Ù¹Ù…Ø± Ø´Ø§Ù…Ù„ Ú©Ø±ÛŒÚº'],

  'Customer': ['Customer', 'Ú©Ø³Ù¹Ù…Ø±'],

  'Vendor': ['Vendor', 'ÙˆÛŒÙ†ÚˆØ±'],

  'Select Vendor': ['Select Vendor', 'ÙˆÛŒÙ†ÚˆØ± Ù…Ù†ØªØ®Ø¨ Ú©Ø±ÛŒÚº'],

  'Company': ['Company', 'Ú©Ù…Ù¾Ù†ÛŒ'],

  'Address': ['Address', 'Ù¾ØªÛ'],

  'Vendor saved successfully': ['Vendor saved successfully', 'ÙˆÛŒÙ†ÚˆØ± Ú©Ø§Ù…ÛŒØ§Ø¨ÛŒ Ø³Û’ Ù…Ø­ÙÙˆØ¸ ÛÙˆ Ú¯ÛŒØ§'],

  'Add Vendor': ['Add Vendor', 'ÙˆÛŒÙ†ÚˆØ± Ø´Ø§Ù…Ù„ Ú©Ø±ÛŒÚº'],

  'Edit Vendor': ['Edit Vendor', 'ÙˆÛŒÙ†ÚˆØ± Ù…ÛŒÚº ØªØ±Ù…ÛŒÙ… Ú©Ø±ÛŒÚº'],

  'Add Expenditure': ['Add Expenditure', 'Ø§Ø®Ø±Ø§Ø¬Ø§Øª Ø´Ø§Ù…Ù„ Ú©Ø±ÛŒÚº'],

  'Expense Category': ['Expense Category', 'Ø§Ø®Ø±Ø§Ø¬Ø§Øª Ú©ÛŒ Ù‚Ø³Ù…'],
  'Rent': ['Rent', 'Rent'],
  'Utilities (Electricity/Water/Gas)': [
    'Utilities (Electricity/Water/Gas)',
    'Utilities (Electricity/Water/Gas)',
  ],
  'Salaries/Wages': ['Salaries/Wages', 'Salaries/Wages'],
  'Transportation': ['Transportation', 'Transportation'],
  'Maintenance/Repairs': ['Maintenance/Repairs', 'Maintenance/Repairs'],
  'Shop Supplies': ['Shop Supplies', 'Shop Supplies'],
  'Marketing/Advertising': ['Marketing/Advertising', 'Marketing/Advertising'],
  'Miscellaneous': ['Miscellaneous', 'Miscellaneous'],

  'Amount': ['Amount', 'Ø±Ù‚Ù…'],
  'Date': ['Date', 'ØªØ§Ø±ÛŒØ®'],

  'Description': ['Description', 'ØªÙØµÛŒÙ„'],

  'Save Expenditure': ['Save Expenditure', 'Ø§Ø®Ø±Ø§Ø¬Ø§Øª Ù…Ø­ÙÙˆØ¸ Ú©Ø±ÛŒÚº'],

  'Expenditure saved successfully': ['Expenditure saved successfully', 'Ø§Ø®Ø±Ø§Ø¬Ø§Øª Ú©Ø§Ù…ÛŒØ§Ø¨ÛŒ Ø³Û’ Ù…Ø­ÙÙˆØ¸ ÛÙˆ Ú¯Ø¦Û’'],

  'Create Purchase': ['Create Purchase', 'Ø®Ø±ÛŒØ¯Ø§Ø±ÛŒ Ø¨Ù†Ø§Ø¦ÛŒÚº'],

  'Add Item': ['Add Item', 'Ø¢Ø¦Ù¹Ù… Ø´Ø§Ù…Ù„ Ú©Ø±ÛŒÚº'],

  'Product': ['Product', 'Ù¾Ø±ÙˆÚˆÚ©Ù¹'],

  'Select Product': ['Select Product', 'Ù¾Ø±ÙˆÚˆÚ©Ù¹ Ù…Ù†ØªØ®Ø¨ Ú©Ø±ÛŒÚº'],

  'Cost Price': ['Cost Price', 'Ù„Ø§Ú¯Øª'],

  'Paid Amount': ['Paid Amount', 'Ø§Ø¯Ø§ Ø´Ø¯Û Ø±Ù‚Ù…'],

  'Invoice Number (optional)': ['Invoice Number (optional)', 'Ø§Ù†ÙˆØ§Ø¦Ø³ Ù†Ù…Ø¨Ø± (Ø§Ø®ØªÛŒØ§Ø±ÛŒ)'],

  'Save Purchase': ['Save Purchase', 'Ø®Ø±ÛŒØ¯Ø§Ø±ÛŒ Ù…Ø­ÙÙˆØ¸ Ú©Ø±ÛŒÚº'],

  'Purchase recorded successfully': ['Purchase recorded successfully', 'Ø®Ø±ÛŒØ¯Ø§Ø±ÛŒ Ú©Ø§Ù…ÛŒØ§Ø¨ÛŒ Ø³Û’ Ø±ÛŒÚ©Ø§Ø±Úˆ ÛÙˆ Ú¯Ø¦ÛŒ'],

  'Please select a vendor first': ['Please select a vendor first', 'Ø¨Ø±Ø§Û Ú©Ø±Ù… Ù¾ÛÙ„Û’ ÙˆÛŒÙ†ÚˆØ± Ù…Ù†ØªØ®Ø¨ Ú©Ø±ÛŒÚº'],

  'No vendors found': ['No vendors found', 'Ú©ÙˆØ¦ÛŒ ÙˆÛŒÙ†ÚˆØ± Ù†ÛÛŒÚº Ù…Ù„Ø§'],

  'No customers available': ['No customers available', 'Ú©ÙˆØ¦ÛŒ Ú©Ø³Ù¹Ù…Ø± Ø¯Ø³ØªÛŒØ§Ø¨ Ù†ÛÛŒÚº'],

  'New Customer': ['New Customer', 'Ù†ÛŒØ§ Ú©Ø³Ù¹Ù…Ø±'],

  'New Vendor': ['New Vendor', 'Ù†ÛŒØ§ ÙˆÛŒÙ†ÚˆØ±'],

  'Cart cleared': ['Cart cleared', 'Ú©Ø§Ø±Ù¹ ØµØ§Ù Ú©Ø± Ø¯ÛŒØ§ Ú¯ÛŒØ§'],

  'Edit Cart': ['Edit Cart', 'Ú©Ø§Ø±Ù¹ Ù…ÛŒÚº ØªØ±Ù…ÛŒÙ… Ú©Ø±ÛŒÚº'],

  'Payment Details': ['Payment Details', 'Ø§Ø¯Ø§Ø¦ÛŒÚ¯ÛŒ Ú©ÛŒ ØªÙØµÛŒÙ„Ø§Øª'],

  'Insufficient credit available': ['Insufficient credit available', 'Ú©Ø±ÛŒÚˆÙ¹ Ø¯Ø³ØªÛŒØ§Ø¨ Ù†ÛÛŒÚº ÛÛ’'],
  'Available Credit': ['Available Credit', 'Available Credit'],
  'Add Credit': ['Add Credit', 'Add Credit'],
  'History': ['History', 'History'],
  'Total Value': ['Total Value', 'Total Value'],
  'Pending': ['Pending', 'Pending'],
  'Sales History': ['Sales History', 'Sales History'],
  'No sales recorded yet': ['No sales recorded yet', 'No sales recorded yet'],
  'at': ['at', 'at'],
  'Add funds to the customer credit balance.': ['Add funds to the customer credit balance.', 'Add funds to the customer credit balance.'],
  'Enter amount': ['Enter amount', 'Enter amount'],
  'Add a note (optional)': ['Add a note (optional)', 'Add a note (optional)'],
  'Credit History': ['Credit History', 'Credit History'],
  'No credit history yet': ['No credit history yet', 'No credit history yet'],
  'Added': ['Added', 'Added'],
  'Deducted': ['Deducted', 'Deducted'],
  'Used': ['Used', 'Used'],
  'Manual credit adjustment': ['Manual credit adjustment', 'Manual credit adjustment'],
  'Credit added successfully': ['Credit added successfully', 'Credit added successfully'],
  'Enter a valid amount': ['Enter a valid amount', 'Enter a valid amount'],
  'Customer not found': ['Customer not found', 'Customer not found'],
  'This customer may have been deleted or never existed.': ['This customer may have been deleted or never existed.', 'This customer may have been deleted or never existed.'],
  'Close': ['Close', 'Close'],
  'Add an optional note': ['Add an optional note', 'Add an optional note'],
  'Search by sale ID...': ['Search by sale ID...', 'Search by sale ID...'],
  'Showing all {count} transaction(s) for {name} (matched by name/phone)': ['Showing all {count} transaction(s) for {name} (matched by name/phone)', 'Showing all {count} transaction(s) for {name} (matched by name/phone)'],
  'All': ['All', 'All'],
  'Partial': ['Partial', 'Partial'],
  'Partially Paid': ['Partially Paid', 'Partially Paid'],
  'Share All': ['Share All', 'Share All'],
  'Share coming soon': ['Share coming soon', 'Share coming soon'],
  'Delete Sale': ['Delete Sale', 'Delete Sale'],
  'Are you sure you want to delete this sale?': ['Are you sure you want to delete this sale?', 'Are you sure you want to delete this sale?'],
  'Sale deleted': ['Sale deleted', 'Sale deleted'],

  'Search by name, phone, or email...': [

    'Search by name, phone, or email...',

    'Search by name, phone, or email...',

  ],

  'With Credit': ['With Credit', 'With Credit'],

  'With Due': ['With Due', 'With Due'],

  'Last Purchase': ['Last Purchase', 'Last Purchase'],

  'View': ['View', 'View'],

  'Sale': ['Sale', 'Sale'],

  'Try adjusting your search terms.': [

    'Try adjusting your search terms.',

    'Try adjusting your search terms.',

  ],

  'Add customers to see them listed here.': [

    'Add customers to see them listed here.',

    'Add customers to see them listed here.',

  ],

  'English': ['English', 'Ø§Ù†Ú¯Ø±ÛŒØ²ÛŒ'],

  'Urdu': ['Urdu', 'Ø§Ø±Ø¯Ùˆ'],

  // Security settings
  'Security': ['Security', 'Ø³ÛŒÚ©ÛŒÙˆØ±Ù¹ÛŒ'],
  'Biometric Authentication': ['Biometric Authentication', 'Ø¨Ø§ÛŒÙˆÙ…ÛŒÙ¹Ø±Ú© ØªØµØ¯ÛŒÙ‚'],
  'Use fingerprint or face ID to unlock': ['Use fingerprint or face ID to unlock', 'Ø§Ù†Ú¯Ù„ÛŒ Ú©Û’ Ù†Ø´Ø§Ù† ÛŒØ§ Ú†ÛØ±Û ID Ø³Û’ Ú©Ú¾ÙˆÙ„ÛŒÚº'],
  'Not available on this device': ['Not available on this device', 'Ø§Ø³ ÚˆÛŒÙˆØ§Ø¦Ø³ Ù¾Ø± Ø¯Ø³ØªÛŒØ§Ø¨ Ù†ÛÛŒÚº'],
  'Biometric authentication enabled': ['Biometric authentication enabled', 'Ø¨Ø§ÛŒÙˆÙ…ÛŒÙ¹Ø±Ú© ØªØµØ¯ÛŒÙ‚ ÙØ¹Ø§Ù„'],
  'Biometric authentication disabled': ['Biometric authentication disabled', 'Ø¨Ø§ÛŒÙˆÙ…ÛŒÙ¹Ø±Ú© ØªØµØ¯ÛŒÙ‚ ØºÛŒØ± ÙØ¹Ø§Ù„'],
  'Failed to update biometric settings': ['Failed to update biometric settings', 'Ø¨Ø§ÛŒÙˆÙ…ÛŒÙ¹Ø±Ú© Ø³ÛŒÙ¹Ù†Ú¯Ø² Ú©Ùˆ Ø§Ù¾ ÚˆÛŒÙ¹ Ú©Ø±Ù†Û’ Ù…ÛŒÚº Ù†Ø§Ú©Ø§Ù…'],
  'User not found': ['User not found', 'ØµØ§Ø±Ù Ù†ÛÛŒÚº Ù…Ù„Ø§'],
  'No biometrics enrolled': ['No biometrics enrolled', 'Ú©ÙˆØ¦ÛŒ Ø¨Ø§ÛŒÙˆÙ…ÛŒÙ¹Ø±Ú© Ø¯Ø±Ø¬ Ù†ÛÛŒÚº'],
  'Please add fingerprint or face ID in device settings first': ['Please add fingerprint or face ID in device settings first', 'Ù¾ÛÙ„Û’ ÚˆÛŒÙˆØ§Ø¦Ø³ Ú©ÛŒ Ø³ÛŒÙ¹Ù†Ú¯Ø² Ù…ÛŒÚº Ø§Ù†Ú¯Ù„ÛŒ Ú©Û’ Ù†Ø´Ø§Ù† ÛŒØ§ Ú†ÛØ±Û ID Ø´Ø§Ù…Ù„ Ú©Ø±ÛŒÚº'],
  'Enabled - unlock with fingerprint or face ID': ['Enabled - unlock with fingerprint or face ID', 'ÙØ¹Ø§Ù„ - Ø§Ù†Ú¯Ù„ÛŒ Ú©Û’ Ù†Ø´Ø§Ù† ÛŒØ§ Ú†ÛØ±Û ID Ø³Û’ Ú©Ú¾ÙˆÙ„ÛŒÚº'],
  'Tap to enable fingerprint or face ID unlock': ['Tap to enable fingerprint or face ID unlock', 'Ø§Ù†Ú¯Ù„ÛŒ Ú©Û’ Ù†Ø´Ø§Ù† ÛŒØ§ Ú†ÛØ±Û ID Ú©Ùˆ ÙØ¹Ø§Ù„ Ú©Ø±Ù†Û’ Ú©Û’ Ù„ÛŒÛ’ Ù¹ÛŒÙ¾ Ú©Ø±ÛŒÚº'],

  'Create a one-time product for this sale.': [
    'Create a one-time product for this sale.',
    'Create a one-time product for this sale.',
  ],
  'e.g. Service Charge, Gift Wrap, Packing': [
    'e.g. Service Charge, Gift Wrap, Packing',
    'e.g. Service Charge, Gift Wrap, Packing',
  ],
  'Enter price': ['Enter price', 'Enter price'],
  'Price must be greater than 0.': ['Price must be greater than 0.', 'Price must be greater than 0.'],
  'Extra detail label (optional)': ['Extra detail label (optional)', 'Extra detail label (optional)'],
  'Extra detail value (optional)': ['Extra detail value (optional)', 'Extra detail value (optional)'],
  'Use this for size, color, or any extra info.': [
    'Use this for size, color, or any extra info.',
    'Use this for size, color, or any extra info.',
  ],

  'Search & add products': ['Search & add products', 'Search & add products'],
  'Walk-in customer – change': ['Walk-in customer – change', 'Walk-in customer – change'],

  'Adds 1 item immediately; edit in cart if needed': ['Adds 1 item immediately; edit in cart if needed', 'Adds 1 item immediately; edit in cart if needed'],
  'Opens quantity so you can set it before adding': ['Opens quantity so you can set it before adding', 'Opens quantity so you can set it before adding'],

  'Add custom product': ['Add custom product', 'Add custom product'],
  'Cart': ['Cart', 'Cart'],
  'Tap items to edit quantity or price.': ['Tap items to edit quantity or price.', 'Tap items to edit quantity or price.'],
  'Search or scan a product to add it here.': ['Search or scan a product to add it here.', 'Search or scan a product to add it here.'],
  'Discount & tax': ['Discount & tax', 'Discount & tax'],
  'Add extra amount': ['Add extra amount', 'Add extra amount'],
  'Add items to continue.': ['Add items to continue.', 'Add items to continue.'],
  'Advanced options': ['Advanced options', 'Advanced options'],
  'When tapping a product': ['When tapping a product', 'When tapping a product'],
  'Add instantly': ['Add instantly', 'Add instantly'],
  'Ask quantity first': ['Ask quantity first', 'Ask quantity first'],
  'Quick sale (skip details)': ['Quick sale (skip details)', 'Quick sale (skip details)'],
  'Recently added list': ['Recently added list', 'Recently added list'],
  'Tap to open or clear your recent products.': ['Tap to open or clear your recent products.', 'Tap to open or clear your recent products.'],
  'Clear recent': ['Clear recent', 'Clear recent'],
  'Show': ['Show', 'Show'],
  'Walk-in customer (change)': ['Walk-in customer (change)', 'Walk-in customer (change)'],

  'All codes': ['All codes', '???? ????'],
  'Barcode only': ['Barcode only', '??? ??????'],
  'QR only': ['QR only', '??? ??? ??'],

};



export function translate(
  language: LanguageCode,
  englishPhrase: string,
  fallbackUrdu?: string
): string {
  const normalizeUrdu = (value: string) => {
    if (!value) {
      return '';
    }
    // Already readable Urdu/script text
    if (/[\u0600-\u06FF]/.test(value)) {
      return value;
    }
    // Try to fix mojibake (UTF-8 bytes interpreted as latin1)
    try {
      const decoded = Buffer.from(value, 'latin1').toString('utf8');
      if (/[\u0600-\u06FF]/.test(decoded)) {
        return decoded;
      }
    } catch {
      // ignore decode issues
    }
    return value;
  };

  const safeUrdu = (raw: string) => {
    const normalized = normalizeUrdu(raw);
    const hasArabic = /[\u0600-\u06FF]/.test(normalized);
    const hasReplacement = /\ufffd/.test(normalized);
    // If we have Arabic script, prefer showing it even if some characters couldn't decode perfectly
    if (hasArabic) {
      return normalized;
    }
    // Fallback to English if we still can't render Urdu cleanly
    return englishPhrase;
  };

  const entry = TRANSLATION_DICTIONARY[englishPhrase];

  if (entry) {
    if (language === 'english') {
      return entry[0];
    }
    if (language === 'urdu') {
      return safeUrdu(entry[1]);
    }
    return entry[0];
  }

  if (language === 'urdu') {
    return safeUrdu(fallbackUrdu ?? englishPhrase);
  }

  return englishPhrase;
}
export function registerTranslation(

  englishPhrase: string,

  urduPhrase: string

): void {

  TRANSLATION_DICTIONARY[englishPhrase] = [englishPhrase, urduPhrase];

}



export const availableTranslations = TRANSLATION_DICTIONARY;


