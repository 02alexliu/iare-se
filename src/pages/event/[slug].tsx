import { useRecoilSSRState, useRecoilSSRValue } from "components/RecoilSSR";
import strapi, { gql } from "lib/strapi";
import { GetStaticPaths, GetStaticProps } from "next";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { useRecoilCallback } from "recoil";
import {
    forceValue,
    intention,
    intentionState,
    paymentState,
    pidFromIntention,
    ticketsFromIntention,
    validateIntention,
    validatePassword,
} from "state/checkout";
import { Allergy, ComponentEventTickets, Diet, Event } from "types/strapi";
import { isBefore } from "date-fns";
import { useRouter } from "next/router";

import {
    Flex,
    Box,
    Icon,
    Heading,
    Text,
    VStack,
    Stack,
    StackDivider,
    Button,
    Spacer,
    useBreakpointValue,
    Center,
    Circle,
} from "@chakra-ui/react";

import { Option } from "components/Autocomplete";
import { IConfirmation, IPasswordProtect, MinDiet } from "types/checkout";
import { EventPasswordProtection } from "components/event/EventPasswordProtection";
import { CheckoutApi, useDibs } from "hooks/use-dibs";
import useTranslation from "next-translate/useTranslation";
import { changeLocaleData } from "utils/lang";
import AccessibleLink from "components/AccessibleLink";
import { IoMdArrowDropleft } from "react-icons/io";
import { FaMapMarkerAlt } from "react-icons/fa";
import { getDate } from "utils/dates";
import { MdDateRange } from "react-icons/md";
import { BiCheck } from "react-icons/bi";
import { VStepper } from "components/event/VStepper";
import { Two } from "components/event/steps/Two";
import { One } from "components/event/steps/One";
import { Three } from "components/event/steps/Three";
import { useScroll } from "hooks/use-scroll";
import { motion } from "framer-motion";

interface Props {
    event: Event;
    diets: Diet[];
    allergies: Allergy[];
}
const EventView = ({ event, diets, allergies }: Props) => {
    const { t, lang } = useTranslation("event");
    const router = useRouter();

    const Dibs = useDibs();
    const [beforeDeadline] = useState(
        isBefore(new Date(), new Date(event.deadline))
    );
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [checkout, setCheckout] = useState<CheckoutApi>();
    const [dietResult, setDietResult] = useState<Option[]>([]);
    const [specialDietResult, setSpecialDietResult] = useState<Option[]>([]);
    const [paymentInitialized, setPaymentInitialized] =
        useState<boolean>(false);
    const [orderIsFree, setOrderIsFree] = useState<boolean>(false);
    const [invalidIntention, setInvalidIntention] = useState(false);
    const [deliverySuccess, setDeliverySuccess] = useState(false);

    const [paymentId] = useRecoilSSRValue(pidFromIntention);
    const [[_, setPid]] = useRecoilSSRState(paymentState);
    const [intentionId] = useRecoilSSRValue(intentionState);
    const [[__, setIntentedTickets]] = useRecoilSSRState(forceValue);
    const [intendedTickets] = useRecoilSSRValue(ticketsFromIntention);

    const supportedLanguages = useCallback(
        (lang) => (lang === "en" ? "en-GB" : "sv-SE"),
        []
    );

    const nextQueryParams = () => {
        const query = router.asPath.split("?")[1];
        if (!query) return {};
        const pairs = query.split(/[;&]/);
        const params = pairs.reduce((params, kv) => {
            const [key, value] = kv.split("=");
            if (key && value) {
                return { ...params, [key]: value };
            }
            return { ...params };
        }, {});
        return params as any;
    };

    const checkoutRef = useRef<HTMLDivElement>(null);
    const { ref: formRef, scrollTo } = useScroll<HTMLDivElement>({
        behavior: "smooth",
        block: "center",
        inline: "center",
    });

    const handlePasswordSubmit = async ({ password }: IPasswordProtect) => {
        const isValid = await validatePassword(event.id, password);
        setIsAuthenticated(isValid);
        return isValid;
    };
    const handleDelivery = useCallback(({ success }) => {
        if (success) {
            setDeliverySuccess(success);
        }
    }, []);

    const handleLanguageChange = useCallback(() => {
        if (checkout) {
            checkout.freezeCheckout();
            checkout.setLanguage(supportedLanguages(lang));
            checkout.thawCheckout();
        }
    }, [checkout, lang, supportedLanguages]);

    const handleOrderUpdate = useCallback(
        async (ticketId: string) => {
            if (checkout) checkout.freezeCheckout();
            if (intentionId !== "-1") {
                const url = `${process.env.NEXT_PUBLIC_DETA_URL}/intent/${event.fullfillmentUID}/${intentionId}`;
                const res = await fetch(url, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        tickets: [ticketId],
                    }),
                });
                if (res.ok) {
                    const data = await res.json();
                    setOrderIsFree(data.paymentId ? false : true);
                    if (setPid) {
                        setPid(data.paymentId ? data.paymentId : "-1");
                    }
                    if (setIntentedTickets) setIntentedTickets(ticketId);
                }
            }
            if (checkout) checkout.thawCheckout();
        },
        [
            checkout,
            event.fullfillmentUID,
            intentionId,
            setIntentedTickets,
            setPid,
        ]
    );

    const handleFreeOrder = useCallback(
        async (orderBody: IConfirmation) => {
            if (intentionId !== "-1") {
                const url = `${process.env.NEXT_PUBLIC_DETA_URL}/intent/${intentionId}/complete`;

                const diets = dietResult.map((entity) =>
                    parseInt(entity.value)
                );
                const allergens = specialDietResult.map((entity) =>
                    parseInt(entity.value)
                );

                const res = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        ...orderBody,
                        diets,
                        allergens,
                    }),
                });

                if (res.ok) {
                    handleDelivery({ success: true });
                }
            }
        },
        [intentionId, dietResult, specialDietResult, handleDelivery]
    );

    const handleOrderDetails = useCallback(async () => {
        if (
            dietResult.length > 0 ||
            specialDietResult.length > 0 ||
            intentionId !== "-1"
        ) {
            const url = `${process.env.NEXT_PUBLIC_STRAPI_BACKEND_URL}/orders/${intentionId}/diets`;

            const body = {} as { diets: MinDiet[]; allergens: MinDiet[] };
            if (dietResult.length > 0)
                body["diets"] = dietResult.map((entity) => ({
                    id: parseInt(entity.value),
                    name: entity.label,
                }));
            if (specialDietResult.length > 0)
                body["allergens"] = specialDietResult.map((entity) => ({
                    id: parseInt(entity.value),
                    name: entity.label,
                }));
            const res = await fetch(url, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(body),
            });
        }
    }, [intentionId, dietResult, specialDietResult]);

    const checkoutSession = useRecoilCallback(
        ({ set, snapshot }) =>
            async () => {
                const { iid } = nextQueryParams();
                if (!iid) {
                    const { intentionId, paymentId } =
                        await snapshot.getPromise(
                            intention(event.fullfillmentUID as string)
                        );
                    router.push(`/event/${event.slug}?iid=${intentionId}`);
                    set(intentionState, intentionId);

                    if (paymentId && paymentId !== "-1") {
                        set(paymentState, paymentId);
                    }
                } else {
                    const validIntention = await snapshot.getPromise(
                        validateIntention(iid)
                    );
                    if (validIntention) {
                        set(intentionState, iid);
                    } else {
                        setInvalidIntention(true);
                    }
                }
                /** When paymentId is set to "-1" it means that the
                 *  intention started with a free ticket.
                 */
                setOrderIsFree(!paymentId || paymentId === "-1" ? true : false);

                if (
                    paymentId &&
                    intentionId &&
                    paymentId !== "-1" &&
                    intentionId !== "-1" &&
                    !invalidIntention &&
                    Dibs &&
                    checkoutRef.current &&
                    checkoutRef.current?.childElementCount === 0 &&
                    activeStep === 2
                ) {
                    setOrderIsFree(false);
                    const checkoutConfig = {
                        checkoutKey: process.env
                            .NEXT_PUBLIC_TEST_CHECKOUT_KEY as string,
                        paymentId: paymentId,
                        language: supportedLanguages(lang),
                        containerId: "checkout",
                    };
                    const _checkout = new Dibs.Checkout(checkoutConfig);
                    _checkout.on("payment-completed", () =>
                        handleDelivery({ success: true })
                    );
                    _checkout.setTheme({
                        textColor: "#000",
                        primaryColor: "#1A2123",
                        linkColor: "#357AA5",
                        backgroundColor: "#fff",
                        fontFamily: "Source Sans Pro",
                        placeholderColor: "#767676",
                        outlineColor: "#BEBEBE",
                        primaryOutlineColor: "#976E49",
                    });
                    _checkout.on("pay-initialized", () => {
                        setPaymentInitialized(true);
                        _checkout.send("payment-order-finalized", true);
                    });
                    setCheckout(_checkout);
                }
            }
    );

    useEffect(() => {
        handleLanguageChange();
    }, [lang, handleLanguageChange]);

    useEffect(() => {
        if (paymentInitialized) {
            handleOrderDetails();
        }
    }, [paymentInitialized, handleOrderDetails]);

    const [isLoaded, setIsLoaded] = useState(false);
    useEffect(() => {
        const netsCheckout = document.getElementById("nets-checkout-iframe");
        if (netsCheckout) {
            netsCheckout.style.width = "100%";
            netsCheckout.addEventListener("load", () =>
                setTimeout(() => setIsLoaded(true), 2000)
            );
            return () => {
                netsCheckout.removeEventListener("load", () =>
                    setIsLoaded(false)
                );
            };
        }
    }, [checkout, orderIsFree]);

    const [activeStep, setActiveStep] = useState(0);

    useEffect(() => {
        if (beforeDeadline && isAuthenticated) {
            checkoutSession();
        }
    }, [
        intentionId,
        paymentId,
        orderIsFree,
        activeStep,
        beforeDeadline,
        checkoutSession,
        isAuthenticated,
    ]);

    const steps = useMemo(() => {
        const _steps = [];
        if (event.tickets?.Tickets?.length ?? 0 > 0) {
            _steps.push({
                label: t("step.one"),
                content: function OneFactory() {
                    return (
                        <One
                            label={t("step.one")}
                            intendedTickets={intendedTickets as string[]}
                            tickets={event.tickets as ComponentEventTickets}
                            handleOrderUpdate={handleOrderUpdate}
                        />
                    );
                },
            });
        }
        if (event.servingOptions?.servingFood) {
            _steps.push({
                label: t("step.two"),
                content: function TwoFactory() {
                    return (
                        <Two
                            label={t("step.two")}
                            diets={diets}
                            allergies={allergies}
                            dietResult={dietResult}
                            setDietResult={setDietResult}
                            specialDietResult={specialDietResult}
                            setSpecialDietResult={setSpecialDietResult}
                        />
                    );
                },
            });
        }
        _steps.push({
            label: t("step.three"),
            content: function ThreeFactory() {
                return (
                    <Three
                        label={t("step.three")}
                        invalidIntention={invalidIntention}
                        orderIsFree={orderIsFree}
                        handleFreeOrder={handleFreeOrder}
                        checkoutRef={checkoutRef}
                        isLoaded={isLoaded}
                    />
                );
            },
        });
        return _steps;
    }, [
        t,
        allergies,
        diets,
        dietResult,
        specialDietResult,
        handleFreeOrder,
        handleOrderUpdate,
        event.tickets,
        intendedTickets,
        invalidIntention,
        orderIsFree,
        isLoaded,
        event.servingOptions,
    ]) as { label: string; content: () => JSX.Element }[];

    const [prevPages, setPrevPages] = useState<number[]>([]);

    const goForward = useCallback(() => {
        const currentPage = global.window && window.pageYOffset;
        setPrevPages((old) => [...old, currentPage]);

        setActiveStep(Math.max(0, Math.min(activeStep + 1, steps.length - 1)));
    }, [activeStep, steps.length]);

    const goBackward = useCallback(() => {
        const len = prevPages.length - 1;
        if (len + 1 > 0) {
            const y = prevPages[len];
            setPrevPages((old) => [...old.filter((_, i) => i !== len)]);
            global.window && window.scrollTo(0, y);
        }
        setActiveStep(Math.max(0, Math.min(activeStep - 1, steps.length - 1)));
    }, [prevPages, activeStep, steps.length]);
    const step = useMemo(() => steps[activeStep], [steps, activeStep]);

    const isAboveMd = useBreakpointValue({ base: false, lg: true });

    const MotionCircle = motion(Circle);
    const MotionText = motion(Text);

    return (
        <Flex
            direction="column"
            bg="white"
            pos="relative"
            px={{ base: 2, md: 16 }}
            py={{ base: 4, md: 10 }}
            _before={{
                content: '""',
                bg: "gray.50",
                position: "absolute",
                borderTop: "1px solid",
                borderTopColor: "gray.200",
                width: "full",
                left: 0,
                height: "full",
                top: { base: "270px", md: "320px" },
            }}
        >
            <Box w="full">
                <AccessibleLink
                    href="/feed/event"
                    textDecoration="none"
                    _hover={{ textDecoration: "none" }}
                >
                    <Icon as={IoMdArrowDropleft} /> {t("back")}
                </AccessibleLink>
                <Flex align="center">
                    <Heading
                        my={4}
                        size="2xl"
                        textTransform="capitalize"
                        fontWeight="bold"
                    >
                        {event.title}
                    </Heading>
                    <Spacer />
                    {!isAboveMd && (
                        <Box>
                            <Flex align="center">
                                <Icon as={FaMapMarkerAlt} mr={2} />
                                <Text
                                    textTransform="capitalize"
                                    fontWeight="600"
                                >
                                    {event?.place?.name}
                                </Text>
                            </Flex>
                            <Flex align="center">
                                <Icon as={MdDateRange} mr={2} />
                                <Text
                                    textTransform="capitalize"
                                    fontWeight="600"
                                >
                                    {getDate(
                                        event.startTime,
                                        "EEEE d MMM",
                                        lang
                                    )}
                                </Text>
                            </Flex>
                        </Box>
                    )}
                </Flex>
                <Text color="gray.600" my={6} noOfLines={5}>
                    {event.description}
                </Text>
            </Box>
            <Stack
                direction={{ base: "column", lg: "row" }}
                spacing={{ base: 6, md: 16 }}
                w="full"
                zIndex="1"
            >
                {!isAboveMd && (
                    <Box
                        bg="gray.100"
                        w="full"
                        rounded="md"
                        p={6}
                        fontWeight="600"
                    >
                        {event.committee?.name}
                    </Box>
                )}
                {isAboveMd && (
                    <Box as="aside" w="250px" h="full">
                        <Box bg="gray.100" rounded="md" p={6} fontWeight="600">
                            {event.committee?.name}
                        </Box>
                        <VStack
                            mt={14}
                            spacing={8}
                            divider={<StackDivider borderColor="gray.200" />}
                            align="stretch"
                        >
                            <Box>
                                <Flex align="center">
                                    <Icon as={FaMapMarkerAlt} mr={2} />
                                    <Text
                                        textTransform="capitalize"
                                        fontWeight="600"
                                    >
                                        {event?.place?.name}
                                    </Text>
                                </Flex>
                                <Flex align="center">
                                    <Icon as={MdDateRange} mr={2} />
                                    <Text
                                        textTransform="capitalize"
                                        fontWeight="600"
                                    >
                                        {getDate(
                                            event.startTime,
                                            "EEEE d MMM",
                                            lang
                                        )}
                                    </Text>
                                </Flex>
                            </Box>
                            <VStepper steps={steps} activeStep={activeStep} />
                        </VStack>
                    </Box>
                )}

                <Flex
                    ref={formRef}
                    as="article"
                    bg="white"
                    rounded="sm"
                    shadow="2xl"
                    flex={1}
                    borderWidth="1px"
                    borderColor="gray.200"
                    direction="column"
                    minH="450px"
                    pos="relative"
                    p={activeStep < steps.length - 1 ? 6 : undefined}
                >
                    {deliverySuccess && (
                        <Box display="grid" placeItems="center" minH="450px">
                            <Flex align="center" direction="column">
                                <MotionCircle
                                    bg="green.100"
                                    animate={{
                                        scale: 1,
                                        transition: {
                                            duration: 0.8,
                                            type: "spring",
                                            bounce: 0.8,
                                        },
                                    }}
                                    initial={{ scale: 0.75 }}
                                    exit={{ scale: 0.75 }}
                                    size={24}
                                >
                                    <Icon
                                        as={BiCheck}
                                        color="green.300"
                                        boxSize={24}
                                    />
                                </MotionCircle>
                                <Box mt={4} overflow="hidden" h={10}>
                                    <MotionText
                                        color="green.300"
                                        fontSize="2xl"
                                        fontWeight="bold"
                                        animate={{
                                            opacity: 1,
                                            y: 0,
                                            transition: {
                                                type: "spring",
                                                duration: 0.4,
                                                delay: 0.2,
                                            },
                                        }}
                                        initial={{ opacity: 0, y: 50 }}
                                    >
                                        {t("delivery.status")}
                                    </MotionText>
                                </Box>
                                <Box overflow="hidden" h={8}>
                                    <MotionText
                                        fontSize="lg"
                                        fontWeight="500"
                                        animate={{
                                            opacity: 1,
                                            y: 0,
                                            transition: {
                                                type: "spring",
                                                duration: 0.4,
                                                delay: 0.4,
                                            },
                                        }}
                                        initial={{ opacity: 0, y: 50 }}
                                    >
                                        {t("delivery.message", {
                                            email: "null",
                                        })}
                                    </MotionText>
                                </Box>
                            </Flex>
                        </Box>
                    )}
                    {!deliverySuccess &&
                    event.passwordProtected &&
                    !isAuthenticated ? (
                        <EventPasswordProtection
                            scrollTo={scrollTo}
                            onSubmit={handlePasswordSubmit}
                            placeholderText={t("passwordProtected.placeholder")}
                            showLabel={t("passwordProtected.showLabel")}
                            hideLabel={t("passwordProtected.hideLabel")}
                            submitLabel={t("passwordProtected.validateLabel")}
                            errorLabel={t("errorLabel")}
                            successLabel={t("successLabel")}
                        />
                    ) : (
                        <>
                            {!deliverySuccess && step.content()}

                            <Spacer />
                            <Flex
                                pt={4}
                                pb={
                                    activeStep < steps.length - 1
                                        ? undefined
                                        : 6
                                }
                                px={
                                    activeStep < steps.length - 1
                                        ? undefined
                                        : 6
                                }
                            >
                                <Spacer />
                                <Button onClick={goBackward} mr={1}>
                                    Back
                                </Button>
                                <Button onClick={goForward} ml={1}>
                                    Next
                                </Button>
                            </Flex>
                        </>
                    )}
                </Flex>
            </Stack>
        </Flex>
    );
};

export const getStaticPaths: GetStaticPaths = async () => {
    const { data } = await strapi.query<{ events: Event[] }>({
        query: gql`
            query {
                events {
                    slug
                }
            }
        `,
    });
    return {
        paths: data.events.map((e) => ({
            params: {
                slug: e.slug as string,
            },
        })),
        fallback: "blocking",
    };
};

export const getStaticProps: GetStaticProps = async ({ locale, params }) => {
    const { data } = await strapi.query<{
        event: Event;
        diets: Diet[];
        allergies: Allergy[];
    }>({
        query: gql`
            query FindEvent($slug: ID!) {
                event(id: $slug) {
                    locale
                    fullfillmentUID
                    id
                    slug
                    title
                    description
                    committee {
                        name
                    }
                    tickets {
                        Tickets {
                            id
                            swedishName
                            englishName
                            ticketUID
                            price
                        }
                        allowMultiple
                    }
                    servingOptions {
                        servingFood
                    }
                    place {
                        name
                        detailedStreetInfo {
                            streetName
                            streetPostalCode
                        }
                        showMap
                    }

                    startTime
                    endTime
                    deadline
                    published_at
                    passwordProtected {
                        __typename
                    }
                    localizations {
                        id
                        fullfillmentUID
                        locale
                        slug
                        title
                        description
                        committee {
                            name
                        }
                        tickets {
                            Tickets {
                                id
                                swedishName
                                englishName
                                ticketUID
                                price
                            }
                            allowMultiple
                        }
                        servingOptions {
                            servingFood
                        }
                        place {
                            name
                            detailedStreetInfo {
                                streetName
                                streetPostalCode
                            }
                            showMap
                        }

                        startTime
                        endTime
                        deadline
                        published_at
                        passwordProtected {
                            __typename
                        }
                    }
                }
                diets {
                    id
                    name
                }
                allergies {
                    id
                    name
                }
            }
        `,
        variables: { slug: params?.slug },
    });
    return {
        props: {
            event: changeLocaleData(locale, data.event),
            diets: changeLocaleData(locale, data.diets),
            allergies: changeLocaleData(locale, data.allergies),
        },
        revalidate: 60,
    };
};

export default EventView;
