import SimpleSchema from "simpl-schema";
import axios from "axios";

const inputSchema = new SimpleSchema({
  action: {
    type: String,
    optional: true,
  },
  fromShop: {
    type: Object,
    blackbox: true,
  },
  to: {
    type: String,
  },
  language: {
    type: String,
    optional: true,
  },
  dataForEmail: {
    type: Object,
    blackbox: true,
  },
});

/**
 * @name sendOrderEmail
 * @summary A mutation that compiles and server-side renders the email template with order data, and sends the email
 * @param {Object} context GraphQL context
 * @param {Object} input Data for email: action, dataForEmail, fromShop, to
 * @returns {Undefined} no return
 */
export default async function sendOrderEmail(context, input) {
  inputSchema.validate(input);

  const { action, dataForEmail, fromShop, language, to } = input;

  const getImageUrl = (metafields) => {
    const key = "productImage";
    const s3Url =
      "https://askbella-product-images.s3-ap-southeast-2.amazonaws.com/"; // env file?
    let value;
    metafields.forEach((m) => {
      if (m.key === key) value = m.value;
    });
    return s3Url + value;
  };

  // Compile email
  let templateName;

  if (action === "shipped") {
    templateName = "orders/shipped";
  } else if (action === "refunded") {
    templateName = "orders/refunded";
  } else if (action === "itemRefund") {
    templateName = "orders/itemRefund";
  } else {
    templateName = `orders/${dataForEmail.order.workflow.status}`;
  }
  const { order } = dataForEmail;
  const { shipping, payments, discounts } = order;
  let emailData = {
    first_name: shipping[0].address.fullName.split(" ")[0],
    full_name: shipping[0].address.fullName, // shipping[0].address.fullName
    shipping_address: shipping[0].address.address1, //shipping[0].address.address1
    shipping_address_2: `${shipping[0].address.city} ${shipping[0].address.region} ${shipping[0].address.postal}`, //shipping[0].address.address1
    order_number: order.referenceId, // order.referenceId
    order_date: order.updatedAt, // order.createdAt OR updatedAt (will need to change the format)
    contact_number: shipping[0].address.phone, // shipping[0].address.phone
    billing_address: payments[0].address.address1, //payments[0].address.address1
    billing_address_2: `${payments[0].address.city} ${payments[0].address.region} ${payments[0].address.postal}`, //shipping[0].address.address1
    shipping_method: shipping[0].shipmentMethod.label, // shipping[0].shipmentMethod.label
    payment_method: payments[0].displayName, // payment[0].displayName (will need to change the format perhaps)
    product: shipping[0].items.map((item) => {
      return {
        product_image: getImageUrl(item.metafields),
        product_description: item.title,
        product_price: "$" + item.price.amount.toFixed(2), // (Perhaps, we can add displayPrice to the orders mutation or it should already be there in the new one instead of amount)
      };
    }),
    shipping_handling_cost: "$" + shipping[0].invoice.shipping.toFixed(2), // "$" + shipping[0].invoice.shipping.toFixed(2)
    sub_total_cost: "$" + shipping[0].invoice.subtotal.toFixed(2), // "$" + shipping[0].invoice.subtotal.toFixed(2)
    total_cost: "$" + shipping[0].invoice.total.toFixed(2), // "$" + shipping[0].invoice.total.toFixed(2)
  };
  if (discounts && discounts[0] && discounts[0].amount) {
    emailData.promo_discount = "$" + discounts[0].amount.toFixed(2); // We just have discount amount not the title
  }

  if (shipping && shipping[0] && shipping[0].tracking) {
    emailData.tracking_number = shipping[0].tracking;
  }

  let template = "";
  if (
    dataForEmail.order.workflow.status === "coreOrderWorkflow/processing" &&
    shipping &&
    shipping[0] &&
    shipping[0].tracking
  ) {
    // send email if status is processing and tracking number exists
    template = "orderShipped";
  } else if (templateName === "orders/new") {
    template = "orderConfirmed";
  }

  let fullEmailData = {
    template: template,
    templateVars: {
      to: {
        email: order.email,
        name: shipping[0].address.fullName,
      },
      from: {
        email: "orders@askbella.com.au",
        name: "askbella",
      },
      replyTo: {
        email: "orders@askbella.com.au",
        name: "askbella",
      },
      dynamicData: emailData,
    },
  };

  if (template !== "") {
    axios
      .post(
        "https://mq7b29mtd5.execute-api.ap-southeast-2.amazonaws.com/production/api/sendEmail",
        fullEmailData,
        {
          headers: { origin: "https://askbella.com.au" },
        }
      )
      .then(function (response) {
        console.log(response);
      })
      .catch(function (error) {
        console.log(error);
      });

    // await context.mutations.sendEmail(context, {
    //   data: emailData,
    //   fromShop,
    //   templateName,
    //   language,
    //   to
    // });
  }
}
